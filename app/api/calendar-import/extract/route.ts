import { NextRequest, NextResponse } from "next/server";
import { pdfTextLayer, receiveImportDocument } from "@/lib/import/intake";
import { extractCalendarPreview } from "@/lib/calendar-import/extract";
import { getGeminiReader } from "@/lib/calendar-import/ai-reader";

// Step 1 of a calendar import: take the uploaded document, keep the original, and return an editable PREVIEW of the events
// found in it. This route writes NO calendar data - events only come into existence when an administrator confirms the
// reviewed preview (lib/actions/calendar-import.ts). A route (not a server action) because the document can be larger than a
// server action's body limit and the AI reader can take a while. Who may upload, what counts as a valid document and keeping
// the original are shared with the timetable importer in lib/import/intake.ts.
export const maxDuration = 60;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const doc = await receiveImportDocument(request, "calendar-imports");
  if (!doc.ok) return doc.response;

  const outcome = await extractCalendarPreview(doc.bytes, doc.kind, { pdfText: pdfTextLayer, reader: getGeminiReader() }, { defaultYear: null });
  if (!outcome.ok) {
    await doc.discard();
    return NextResponse.json({ ok: false, error: outcome.error }, { status: 422 });
  }
  return NextResponse.json({ ...outcome, sourceName: doc.name, sourceUrl: doc.url });
}
