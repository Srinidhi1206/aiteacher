import { NextRequest, NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth/current-session";
import { storage, safeFilename } from "@/lib/storage";
import { extractCalendarPreview, ACCEPTED_TYPES, MAX_BYTES } from "@/lib/calendar-import/extract";
import { getGeminiReader } from "@/lib/calendar-import/ai-reader";
import { prisma } from "@/lib/prisma";

// Step 1 of a calendar import: take the uploaded document, keep the original, and return an editable PREVIEW of the events
// found in it. This route writes NO calendar data - events only come into existence when an administrator confirms the
// reviewed preview (lib/actions/calendar-import.ts). A route (not a server action) because the document can be larger than a
// server action's body limit and the AI reader can take a while.
export const maxDuration = 60;

// What a file claims to be is checked against its first bytes - the browser's content type alone is not trusted.
function sniff(bytes: Uint8Array): (typeof ACCEPTED_TYPES)[number] | null {
  const startsWith = (sig: number[]) => sig.every((b, i) => bytes[i] === b);
  if (startsWith([0x25, 0x50, 0x44, 0x46, 0x2d])) return "application/pdf"; // %PDF-
  if (startsWith([0x89, 0x50, 0x4e, 0x47])) return "image/png";
  if (startsWith([0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith([0x52, 0x49, 0x46, 0x46]) && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return "image/webp"; // RIFF....WEBP
  return null;
}

async function pdfText(bytes: Uint8Array): Promise<string> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  const extracted = await extractText(pdf, { mergePages: false });
  return (Array.isArray(extracted.text) ? extracted.text : [extracted.text]).join("\n");
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const session = await getCurrentSession();
  if (!session || session.role !== "admin") return NextResponse.json({ ok: false, error: "Only administrators can import a calendar." }, { status: 403 });
  const admin = await prisma.admin.findUnique({ where: { userId: session.id }, select: { isSuperAdmin: true, schoolId: true } });
  if (!admin || (!admin.isSuperAdmin && !admin.schoolId)) return NextResponse.json({ ok: false, error: "Your account is not attached to a school, so there is no school calendar to import into." }, { status: 403 });

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ ok: false, error: "That upload could not be read." }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return NextResponse.json({ ok: false, error: "Choose a PDF or an image of the calendar." }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ ok: false, error: `That file is larger than ${MAX_BYTES / 1024 / 1024} MB. Use a smaller scan, or a screenshot.` }, { status: 413 });

  const bytes = new Uint8Array(await file.arrayBuffer());
  const kind = sniff(bytes);
  if (!kind) return NextResponse.json({ ok: false, error: "That does not look like a PDF, PNG, JPEG or WebP file." }, { status: 400 });
  if (!storage.isConfigured) return NextResponse.json({ ok: false, error: "File storage is not available, so the original document cannot be kept. Try again later." }, { status: 503 });

  // Keep the original for reference, then read it. If reading fails nothing is kept.
  const pathname = `calendar-imports/${admin.schoolId ?? "platform"}/${Date.now()}-${safeFilename(file.name)}`;
  const uploaded = await storage.upload({ file: new Blob([bytes], { type: kind }), pathname, contentType: kind });

  const outcome = await extractCalendarPreview(bytes, kind, { pdfText, reader: getGeminiReader() }, { defaultYear: null });
  if (!outcome.ok) {
    await storage.delete(uploaded.storageKey).catch(() => {});
    return NextResponse.json({ ok: false, error: outcome.error }, { status: 422 });
  }
  return NextResponse.json({ ...outcome, sourceName: safeFilename(file.name), sourceUrl: uploaded.url });
}
