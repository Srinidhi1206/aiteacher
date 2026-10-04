// From an uploaded timetable document to an editable PREVIEW. Never writes anything. Same shape as the calendar importer:
//   PDF with a usable text layer -> the rule-based text parser; if it finds too little, the AI reader on that text
//   PDF without / with an unusable text layer, or an image -> the AI reader on the file itself (OCR / document vision)
// and every result goes through the same normaliser, which flags whatever looks wrong. The dependencies are passed in so the
// whole flow can be tested without a network.
import { ACCEPTED_TYPES, MAX_BYTES } from "@/lib/calendar-import/extract";
import { normalizeTimetable, summarizeTimetable } from "@/lib/timetable/normalize";
import { parseTimetableText, timetableTextLooksParseable } from "@/lib/timetable/parse-text";
import type { ExtractedTimetable, PreviewGroup, TimetableSummary } from "@/lib/timetable/types";

export type TimetableReaderInput = { kind: "text"; text: string } | { kind: "file"; bytes: Uint8Array; mimeType: string };

export interface TimetableExtractDeps {
  pdfText: (bytes: Uint8Array) => Promise<string>;
  reader: ((input: TimetableReaderInput) => Promise<ExtractedTimetable>) | null;
}

export type TimetableMethod = "text-layer" | "text-layer+ai" | "ai-vision";
export const MAX_GROUPS = 30;
export const MAX_PERIODS_PER_GROUP = 80;

export type TimetableOutcome =
  | { ok: true; method: TimetableMethod; groups: PreviewGroup[]; summary: TimetableSummary; notes: string[] }
  | { ok: false; error: string };

export async function extractTimetablePreview(bytes: Uint8Array, mimeType: string, deps: TimetableExtractDeps): Promise<TimetableOutcome> {
  if (!(ACCEPTED_TYPES as readonly string[]).includes(mimeType)) return { ok: false, error: "Upload a PDF or a PNG / JPEG / WebP image." };
  if (bytes.byteLength === 0) return { ok: false, error: "That file is empty." };
  if (bytes.byteLength > MAX_BYTES) return { ok: false, error: `That file is larger than ${MAX_BYTES / 1024 / 1024} MB.` };

  const notes: string[] = [];
  let method: TimetableMethod;
  let extracted: ExtractedTimetable;

  try {
    if (mimeType === "application/pdf") {
      const text = await deps.pdfText(bytes).catch(() => "");
      if (timetableTextLooksParseable(text)) {
        extracted = parseTimetableText(text);
        method = "text-layer";
      } else if (deps.reader && text.replace(/\s+/g, "").length >= 120) {
        extracted = await deps.reader({ kind: "text", text });
        method = "text-layer+ai";
        notes.push("The PDF's text did not read as a simple list (timetables are often drawn as a grid), so the AI reader structured it. Check every row.");
      } else if (deps.reader) {
        extracted = await deps.reader({ kind: "file", bytes, mimeType });
        method = "ai-vision";
        notes.push("The PDF has no usable text layer, so it was read as an image (OCR). Check every row against the document.");
      } else {
        const partial = parseTimetableText(text);
        if (partial.groups.length === 0) return { ok: false, error: "This PDF has no readable text and the AI reader is not available to read it as an image." };
        extracted = partial;
        method = "text-layer";
        notes.push("Only the parts of the PDF with a text layer could be read; the AI reader is not available for the rest.");
      }
    } else {
      if (!deps.reader) return { ok: false, error: "Reading an image needs the AI reader, which is not available right now." };
      extracted = await deps.reader({ kind: "file", bytes, mimeType });
      method = "ai-vision";
      notes.push("This image was read with OCR / document vision. Check every row against the original.");
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error && e.name === "ReaderUnavailableError" ? e.message : "This document could not be read." };
  }

  let groups = normalizeTimetable(extracted);
  if (groups.length === 0) return { ok: false, error: "No timetable periods were found in this document." };
  if (groups.length > MAX_GROUPS) {
    notes.push(`More than ${MAX_GROUPS} classes were found; only the first ${MAX_GROUPS} are shown.`);
    groups = groups.slice(0, MAX_GROUPS);
  }
  for (const g of groups) {
    if (g.periods.length > MAX_PERIODS_PER_GROUP) {
      g.notes.push(`More than ${MAX_PERIODS_PER_GROUP} periods were found for this class; only the first ${MAX_PERIODS_PER_GROUP} are shown.`);
      g.periods.length = MAX_PERIODS_PER_GROUP;
    }
  }
  if (groups.length > 1) notes.push(`${groups.length} classes were found in this document and are shown separately. Choose the class each one belongs to.`);
  return { ok: true, method, groups, summary: summarizeTimetable(groups), notes };
}
