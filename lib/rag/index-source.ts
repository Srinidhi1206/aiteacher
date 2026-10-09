// Where the text of a textbook comes from when it is indexed - and, just as important, where it does NOT come from. Indexing is called over
// and over (one call per minute-ish), and fetching the PDF or listing storage on every call is what exhausted the file store. So:
//   * a book known to need OCR (its status says so, or its stored size is over the direct-read limit) never downloads its PDF;
//   * a book read directly lists storage for OCR text only when its own text layer turns out to be unusable;
//   * everything else costs one (cached, budgeted) download and no listing.
// Pure of any real I/O: the actions pass the real dependencies in, the tests pass fakes.
import { parseIndexStatus } from "@/lib/rag/index-status";
import { UNREADABLE_TEXT_MESSAGE } from "@/lib/rag/text-quality";
import type { PdfFetch } from "@/lib/rag/pdf-cache";
import type { CompleteOcr } from "@/lib/rag/ocr-store-core";
import { DOWNLOAD_BUDGET_MESSAGE, STORAGE_BLOCKED_MESSAGE } from "@/lib/storage/stop-messages";
import { StorageBlockedError } from "@/lib/storage/blocked";

export type IndexSourceFailure = {
  ok: false;
  /** "stop" failures end the work without touching the saved status; the others are written to the material as before. */
  kind: "stop" | "message";
  message: string;
};

export type IndexSource = { ok: true; pages: string[]; sourceSha: string | null; origin: "ocr" | "pdf" } | IndexSourceFailure;

export interface IndexSourceDeps {
  material: { id: string; sizeKb: number; indexError: string | null };
  maxDirectBytes: number;
  loadOcr(): Promise<CompleteOcr | null>;
  getPdf(): Promise<PdfFetch>;
  extractPages(bytes: Uint8Array): Promise<string[]>;
  textIsReadable(pages: string[]): boolean;
  sha256(bytes: Uint8Array): string;
}

const tooBigMessage = (mb: number) => `This PDF is larger than ${mb} MB, so it cannot be read in one go. It is read page by page (OCR) instead.`;

export async function resolveIndexSource(deps: IndexSourceDeps): Promise<IndexSource> {
  const { material } = deps;
  const note = parseIndexStatus(material.indexError);
  const ocrMarked = note?.kind === "ocr_ready" || note?.kind === "ocr_progress" || (note?.kind === "in_progress" && note.ocr === true);
  const tooBigByRecord = material.sizeKb * 1024 > deps.maxDirectBytes;

  try {
    if (ocrMarked || tooBigByRecord) {
      const ocr = await deps.loadOcr();
      if (ocr) return { ok: true, pages: ocr.pages, sourceSha: ocr.sourceSha256, origin: "ocr" };
      // Its pages are not all read yet: say so - without fetching a PDF that is already known to be unusable as it stands.
      return { ok: false, kind: "message", message: tooBigByRecord && !ocrMarked ? tooBigMessage(Math.round(deps.maxDirectBytes / 1024 / 1024)) : UNREADABLE_TEXT_MESSAGE };
    }

    const got = await deps.getPdf();
    if (!got.ok) {
      if (got.reason === "blocked") return { ok: false, kind: "stop", message: STORAGE_BLOCKED_MESSAGE };
      if (got.reason === "budget") return { ok: false, kind: "stop", message: DOWNLOAD_BUDGET_MESSAGE };
      return { ok: false, kind: "message", message: got.reason === "too_big" ? tooBigMessage(Math.round(deps.maxDirectBytes / 1024 / 1024)) : "The stored file could not be downloaded." };
    }
    let pages: string[];
    try {
      pages = await deps.extractPages(got.bytes);
    } catch {
      return { ok: false, kind: "message", message: "This PDF could not be read." };
    }
    const sha = deps.sha256(got.bytes);
    if (deps.textIsReadable(pages)) return { ok: true, pages, sourceSha: sha, origin: "pdf" };

    // A legacy-font text layer extracts as symbols, not words. If this book's pages were read with OCR, use that; otherwise refuse it.
    const ocr = await deps.loadOcr();
    if (ocr) return { ok: true, pages: ocr.pages, sourceSha: ocr.sourceSha256, origin: "ocr" };
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
