// Receiving an uploaded document for an importer (academic calendar, timetable): who may upload, what it really is, keeping
// the original, and reading a PDF's text layer. Shared by the importers' routes so the rules are written once. Nothing here
// creates any application data.
import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth/current-session";
import { prisma } from "@/lib/prisma";
import { storage, safeFilename } from "@/lib/storage";
import { uploadOrBlocked } from "@/lib/storage/errors";
import { STORAGE_BLOCKED_MESSAGE } from "@/lib/storage/stop-messages";
import { ACCEPTED_TYPES, MAX_BYTES } from "@/lib/calendar-import/extract";

export type DocumentKind = (typeof ACCEPTED_TYPES)[number];

/** What a file really is, from its first bytes - the browser's content type alone is not trusted. */
export function sniffDocument(bytes: Uint8Array): DocumentKind | null {
  const startsWith = (sig: number[]) => sig.every((b, i) => bytes[i] === b);
  if (startsWith([0x25, 0x50, 0x44, 0x46, 0x2d])) return "application/pdf"; // %PDF-
  if (startsWith([0x89, 0x50, 0x4e, 0x47])) return "image/png";
  if (startsWith([0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith([0x52, 0x49, 0x46, 0x46]) && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return "image/webp"; // RIFF....WEBP
  return null;
}

/** The text layer of a PDF ("" when it has none). */
export async function pdfTextLayer(bytes: Uint8Array): Promise<string> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  const extracted = await extractText(pdf, { mergePages: false });
  return (Array.isArray(extracted.text) ? extracted.text : [extracted.text]).join("\n");
}

const fail = (error: string, status: number) => ({ ok: false as const, response: NextResponse.json({ ok: false, error }, { status }) });

/**
 * Checks the caller is an administrator who can import for a school, and that the upload is an acceptable document; keeps the
 * original in storage. On success returns the bytes, their real type, the school (null for the super administrator) and a
 * `discard()` to remove the stored original if the document turns out unreadable.
 */
export async function receiveImportDocument(request: Request, folder: string) {
  const session = await getCurrentSession();
  if (!session || session.role !== "admin") return fail("Only administrators can import documents.", 403);
  const admin = await prisma.admin.findUnique({ where: { userId: session.id }, select: { isSuperAdmin: true, schoolId: true } });
  if (!admin || (!admin.isSuperAdmin && !admin.schoolId)) return fail("Your account is not attached to a school, so there is nothing for you to import into.", 403);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return fail("That upload could not be read.", 400);
  }
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return fail("Choose a PDF or an image.", 400);
  if (file.size > MAX_BYTES) return fail(`That file is larger than ${MAX_BYTES / 1024 / 1024} MB. Use a smaller scan, or a screenshot.`, 413);

  const bytes = new Uint8Array(await file.arrayBuffer());
  const kind = sniffDocument(bytes);
  if (!kind) return fail("That does not look like a PDF, PNG, JPEG or WebP file.", 400);
  if (!storage.isConfigured) return fail("File storage is not available, so the original document cannot be kept. Try again later.", 503);

  const name = safeFilename(file.name);
  const stored = await uploadOrBlocked(() => storage.upload({ file: new Blob([bytes], { type: kind }), pathname: `${folder}/${admin.schoolId ?? "platform"}/${Date.now()}-${name}`, contentType: kind }));
  if (!stored.ok) return fail(STORAGE_BLOCKED_MESSAGE, 503);
  const uploaded = stored.value;
  return {
    ok: true as const,
    bytes,
    kind,
    name,
    url: uploaded.url,
    admin,
    discard: () => storage.delete(uploaded.storageKey).catch(() => {}),
  };
}
