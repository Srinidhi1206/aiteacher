// Human-readable indexing status for a study material, shared by the indexing action (which writes
// it) and the admin screen (which reads it). It is stored in StudyMaterial.indexError - there is no
// separate status column and no schema change - so the wording lives in one place and both sides parse
// the same strings. A real failure message never matches any of these, so it still reads as an error.
// Deliberately free of server-only imports: the browser bundle uses it too.

export type IndexStatusNote =
  | { kind: "in_progress"; done: number; total: number }
  | { kind: "ocr_progress"; done: number; total: number }
  | { kind: "ocr_ready"; total: number }
  | { kind: "complete"; total: number }
  | { kind: "truncated"; done: number; available: number };

export function formatIndexStatus(note: IndexStatusNote): string {
  switch (note.kind) {
    case "in_progress":
      return `Indexing in progress: ${note.done} / ${note.total} passages.`;
    case "ocr_progress":
      return `Reading pages (OCR): ${note.done} / ${note.total} pages.`;
    case "ocr_ready":
      return `Pages read (OCR): all ${note.total} pages. Ready to index.`;
    case "complete":
      return `Complete: ${note.total} / ${note.total} passages.`;
    case "truncated":
      return `Partial: indexed the first ${note.done} of ${note.available} passages (the per-material limit was reached).`;
  }
}

export function parseIndexStatus(text: string | null | undefined): IndexStatusNote | null {
  if (!text) return null;
  let m = /^Indexing in progress: (\d+) \/ (\d+) passages\.$/.exec(text);
  if (m) return { kind: "in_progress", done: Number(m[1]), total: Number(m[2]) };
  m = /^Reading pages \(OCR\): (\d+) \/ (\d+) pages\.$/.exec(text);
  if (m) return { kind: "ocr_progress", done: Number(m[1]), total: Number(m[2]) };
  m = /^Pages read \(OCR\): all (\d+) pages\. Ready to index\.$/.exec(text);
  if (m) return { kind: "ocr_ready", total: Number(m[1]) };
  m = /^Complete: (\d+) \/ (\d+) passages\.$/.exec(text);
  if (m) return { kind: "complete", total: Number(m[2]) };
  m = /^Partial: indexed the first (\d+) of (\d+) passages/.exec(text);
  if (m) return { kind: "truncated", done: Number(m[1]), available: Number(m[2]) };
  return null;
}

// Failure messages that mean "the text cannot be read straight from this PDF, but it can be read page by page (OCR)": a legacy font
// encoding, a scanned book with no text layer, or a file too big to read in one go. Matched by their opening words so the messages
// written by earlier versions still count.
const NEEDS_OCR_PREFIXES = ["This PDF's text uses an old font encoding", "No readable text was found in this PDF", "This PDF is larger than"];

export function needsOcr(text: string | null | undefined): boolean {
  return !!text && NEEDS_OCR_PREFIXES.some((p) => text.startsWith(p));
}
