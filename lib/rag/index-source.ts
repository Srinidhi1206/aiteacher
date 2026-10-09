// Where the text of a textbook comes from when it is indexed - and, just as important, where it does NOT come from. Indexing is called over
// and over (one call per minute-ish), and fetching the PDF or listing storage on every call is what exhausted the file store. So:
//   * a book known to need OCR (its status says so, or its stored size is over the direct-read limit) never downloads its PDF;
//   * a book read directly lists storage for OCR text only when its own text layer turns out to be unusable;
//   * everything else costs one (cached, budgeted) download and no listing.
// Failures are classified by what the caller should DO about them, because the saved status is precious (it carries resumable progress):
//   stop           - storage is blocked / the download allowance is used up or cannot be checked: end the work, change nothing;
//   transient      - saved OCR results could not be read just now: change nothing, do NOT fetch the PDF because of it, try again later;
//   ocr_incomplete - the OCR text is missing or partly unusable: say so (the page-reading step repairs it), keeping the OCR marker;
//   message        - an ordinary failure, reported (and recorded unless the status carries an OCR marker).
// Pure of any real I/O: the actions pass the real dependencies in, the tests pass fakes.
import { formatIndexStatus, hasOcrMarker, mayWriteOcrStatus, parseIndexStatus } from "@/lib/rag/index-status";
import { UNREADABLE_TEXT_MESSAGE } from "@/lib/rag/text-quality";
import type { PdfFetch } from "@/lib/rag/pdf-cache";
import type { OcrState } from "@/lib/rag/ocr-store-core";
import { DOWNLOAD_BUDGET_MESSAGE, DOWNLOAD_BUDGET_UNAVAILABLE_MESSAGE, OCR_STORAGE_UNAVAILABLE_MESSAGE, STORAGE_BLOCKED_MESSAGE } from "@/lib/storage/stop-messages";
import { StorageBlockedError } from "@/lib/storage/blocked";

export type IndexSourceFailure =
  | { ok: false; kind: "stop" | "transient" | "message"; message: string }
  | { ok: false; kind: "ocr_incomplete"; message: string; progress?: { done: number; total: number } };

export type IndexSource = { ok: true; pages: string[]; sourceSha: string | null; origin: "ocr" | "pdf" } | IndexSourceFailure;

export interface IndexSourceDeps {
  material: { id: string; sizeKb: number; indexError: string | null };
  maxDirectBytes: number;
  loadOcr(): Promise<OcrState>;
  getPdf(): Promise<PdfFetch>;
  extractPages(bytes: Uint8Array): Promise<string[]>;
  textIsReadable(pages: string[]): boolean;
}

const tooBigMessage = (mb: number) => `This PDF is larger than ${mb} MB, so it cannot be read in one go. It is read page by page (OCR) instead.`;

/** Maps a failed PDF download to the caller's action. */
export function pdfFailure(reason: Extract<PdfFetch, { ok: false }>["reason"], maxDirectBytes: number): IndexSourceFailure {
  if (reason === "blocked") return { ok: false, kind: "stop", message: STORAGE_BLOCKED_MESSAGE };
  if (reason === "budget") return { ok: false, kind: "stop", message: DOWNLOAD_BUDGET_MESSAGE };
  if (reason === "budget_unavailable") return { ok: false, kind: "stop", message: DOWNLOAD_BUDGET_UNAVAILABLE_MESSAGE };
  return { ok: false, kind: "message", message: reason === "too_big" ? tooBigMessage(Math.round(maxDirectBytes / 1024 / 1024)) : "The stored file could not be downloaded." };
}

export async function resolveIndexSource(deps: IndexSourceDeps): Promise<IndexSource> {
  const { material } = deps;
  const ocrMarked = hasOcrMarker(material.indexError);
  const tooBigByRecord = material.sizeKb * 1024 > deps.maxDirectBytes;
  const maxMb = Math.round(deps.maxDirectBytes / 1024 / 1024);

  try {
    if (ocrMarked || tooBigByRecord) {
      // Known to need OCR: use the saved text - never fetch a PDF that is already known to be unusable as it stands.
      const state = await deps.loadOcr();
      if (state.kind === "complete") return { ok: true, pages: state.pages, sourceSha: state.sourceSha256, origin: "ocr" };
      if (state.kind === "unavailable") return { ok: false, kind: "transient", message: OCR_STORAGE_UNAVAILABLE_MESSAGE };
      if (state.kind === "incomplete") {
        return { ok: false, kind: "ocr_incomplete", message: UNREADABLE_TEXT_MESSAGE, progress: state.totalPages ? { done: state.validPages, total: state.totalPages } : undefined };
      }
      // Nothing stored. A big file that was never read says it is too big; a book marked as OCR-sourced whose results are gone says it needs reading.
      if (tooBigByRecord && !ocrMarked) return { ok: false, kind: "message", message: tooBigMessage(maxMb) };
      return { ok: false, kind: "ocr_incomplete", message: UNREADABLE_TEXT_MESSAGE };
    }

    const got = await deps.getPdf();
    if (!got.ok) return pdfFailure(got.reason, deps.maxDirectBytes);
    let pages: string[];
    try {
      pages = await deps.extractPages(got.bytes); // gives pdf.js its own copy: got.bytes (shared with the cache) stays intact
    } catch {
      return { ok: false, kind: "message", message: "This PDF could not be read." };
    }
    if (deps.textIsReadable(pages)) return { ok: true, pages, sourceSha: got.sha256, origin: "pdf" };

    // A legacy-font text layer extracts as symbols, not words. If this book's pages were read with OCR, use that; otherwise refuse it.
    const state = await deps.loadOcr();
    if (state.kind === "complete") return { ok: true, pages: state.pages, sourceSha: state.sourceSha256, origin: "ocr" };
    if (state.kind === "unavailable") return { ok: false, kind: "transient", message: OCR_STORAGE_UNAVAILABLE_MESSAGE };
    return { ok: false, kind: "message", message: UNREADABLE_TEXT_MESSAGE };
  } catch (e) {
    if (e instanceof StorageBlockedError) return { ok: false, kind: "stop", message: STORAGE_BLOCKED_MESSAGE };
    throw e;
  }
}

/**
 * True when an indexing call has nothing to do: the material is marked indexed, its saved status says "Complete", and the saved passage
 * count reaches that total. `rebuild` (the "Re-index" button) is the only way past it. Answered from the database alone - no download.
 */
export function isAlreadyComplete(args: { indexError: string | null; indexedAt: Date | null; rebuild: boolean; savedPassages: number }): { total: number } | null {
  if (args.rebuild || !args.indexedAt) return null;
  const note = parseIndexStatus(args.indexError);
  return note?.kind === "complete" && args.savedPassages >= note.total ? { total: note.total } : null;
}

/**
 * When the saved page-reading results turn out to be missing or partly unusable, the status should say so truthfully (so the admin screen offers
 * "Continue reading pages"). Returns the status to write, or null to leave it alone: never over indexing progress or a completed book, and never
 * when it already says the same thing. `progress` comes from the checked windows; without it the total is taken from the status itself.
 */
export function ocrRepairStatus(current: string | null, progress?: { done: number; total: number }): string | null {
  const note = parseIndexStatus(current);
  const total = progress?.total ?? (note?.kind === "ocr_ready" || note?.kind === "ocr_progress" ? note.total : null);
  if (!total || total < 1 || !mayWriteOcrStatus(current)) return null;
  const status = formatIndexStatus({ kind: "ocr_progress", done: Math.max(0, Math.min(progress?.done ?? 0, total - 1)), total });
  return status === current ? null : status;
}
