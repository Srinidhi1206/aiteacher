// From an uploaded document to an editable PREVIEW. Never writes anything. The dependencies (reading a PDF's text layer,
// the AI reader) are passed in, so the whole flow can be tested without a network:
//   PDF with a usable text layer  -> the rule-based text parser; if it finds too little, the AI reader on that text
//   PDF without / with an unusable text layer, or an image -> the AI reader on the file itself (OCR / document vision)
// Whatever path is taken, every candidate goes through the same normaliser (lib/calendar-import/normalize.ts).
import { detectNumericOrder } from "@/lib/calendar-import/dates";
import { normalizeCandidates, summarize } from "@/lib/calendar-import/normalize";
import { parseCalendarText, textLooksParseable } from "@/lib/calendar-import/parse-text";
import type { ExtractedCalendar, PreviewEvent, PreviewSummary } from "@/lib/calendar-import/types";

export type ReaderInput = { kind: "text"; text: string } | { kind: "file"; bytes: Uint8Array; mimeType: string };

export interface ExtractDeps {
  /** The text layer of a PDF ("" when there is none). */
  pdfText: (bytes: Uint8Array) => Promise<string>;
  /** The AI reader, or null when it is not configured. */
  reader: ((input: ReaderInput) => Promise<ExtractedCalendar>) | null;
}

export type ExtractMethod = "text-layer" | "text-layer+ai" | "ai-vision";

export interface ExtractResult {
  ok: true;
  method: ExtractMethod;
  academicYear: string;
  events: PreviewEvent[];
  summary: PreviewSummary;
  /** Document-level notes for the administrator (not tied to one row). */
  notes: string[];
}
export type ExtractOutcome = ExtractResult | { ok: false; error: string };

export const ACCEPTED_TYPES = ["application/pdf", "image/png", "image/jpeg", "image/webp"] as const;
export const MAX_BYTES = 4 * 1024 * 1024; // Vercel rejects request bodies over about 4.5 MB
export const MAX_EVENTS = 200;

export async function extractCalendarPreview(bytes: Uint8Array, mimeType: string, deps: ExtractDeps, opts: { defaultYear?: number | null } = {}): Promise<ExtractOutcome> {
  if (!(ACCEPTED_TYPES as readonly string[]).includes(mimeType)) return { ok: false, error: "Upload a PDF or a PNG / JPEG / WebP image." };
  if (bytes.byteLength === 0) return { ok: false, error: "That file is empty." };
  if (bytes.byteLength > MAX_BYTES) return { ok: false, error: `That file is larger than ${MAX_BYTES / 1024 / 1024} MB.` };

  const notes: string[] = [];
  let method: ExtractMethod;
  let extracted: ExtractedCalendar;
  let text = "";

  try {
    if (mimeType === "application/pdf") {
      text = await deps.pdfText(bytes).catch(() => "");
      if (textLooksParseable(text)) {
        extracted = parseCalendarText(text, { defaultYear: opts.defaultYear });
        method = "text-layer";
      } else if (deps.reader && text.replace(/\s+/g, "").length >= 200) {
        // There is text, but not in a shape the parser reads (typically a grid): let the AI structure it.
        extracted = await deps.reader({ kind: "text", text });
        method = "text-layer+ai";
        notes.push("The PDF's text did not read as a simple list, so the AI reader structured it. Check every row.");
      } else if (deps.reader) {
        extracted = await deps.reader({ kind: "file", bytes, mimeType });
        method = "ai-vision";
        notes.push("The PDF has no usable text layer, so it was read as an image (OCR). Check every row against the document.");
      } else {
        const partial = parseCalendarText(text, { defaultYear: opts.defaultYear });
        if (partial.candidates.length === 0) return { ok: false, error: "This PDF has no readable text and the AI reader is not available to read it as an image." };
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

  const academicYear = extracted.academicYear ?? "";
  const events = normalizeCandidates(extracted.candidates, { academicYear: extracted.academicYear, dayFirst: text ? detectNumericOrder(text) : null, defaultYear: opts.defaultYear });
  if (events.length === 0) return { ok: false, error: "No calendar events were found in this document. You can still add events by hand with \"Add event\"." };
  if (events.length > MAX_EVENTS) {
    notes.push(`More than ${MAX_EVENTS} events were found; only the first ${MAX_EVENTS} (by date) are shown.`);
    events.length = MAX_EVENTS;
  }
  return { ok: true, method, academicYear, events, summary: summarize(events), notes };
}
