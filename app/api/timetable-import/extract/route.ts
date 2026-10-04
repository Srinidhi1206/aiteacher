import { NextRequest, NextResponse } from "next/server";
import { pdfTextLayer, receiveImportDocument } from "@/lib/import/intake";
import { extractTimetablePreview } from "@/lib/timetable/extract";
import { getGeminiTimetableReader } from "@/lib/timetable/ai-reader";

// Step 1 of a timetable import: take the uploaded document, keep the original, and return an editable PREVIEW of the classes
// and periods found in it. This route writes NO timetable data - a timetable only comes into existence when an administrator
// confirms the reviewed preview (lib/actions/timetable.ts). A route (not a server action) because the document can be larger
// than a server action's body limit and the AI reader can take a while.
export const maxDuration = 60;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const doc = await receiveImportDocument(request, "timetable-imports");
  if (!doc.ok) return doc.response;

  const outcome = await extractTimetablePreview(doc.bytes, doc.kind, { pdfText: pdfTextLayer, reader: getGeminiTimetableReader() });
  if (!outcome.ok) {
    await doc.discard();
    return NextResponse.json({ ok: false, error: outcome.error }, { status: 422 });
  }
  return NextResponse.json({ ...outcome, sourceName: doc.name, sourceUrl: doc.url });
}
