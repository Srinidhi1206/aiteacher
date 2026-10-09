// One page-reading pass over a textbook, as a function of its dependencies (the actions in lib/actions/material-ocr.ts wire the real ones).
// The order of work is the point of this file: saved progress is looked at FIRST, and the PDF - the expensive thing to fetch - is only
// downloaded when there is genuinely something left to read. Blocked storage and an exhausted download budget end the pass at once.
//
// "Saved" has two strengths. The cheap one is "a window file exists" (one listing). The strong one is "that file was read back and checked"
// (verifySaved). Nothing is declared COMPLETE on the cheap one: before the pass says a book is finished - whether by the "nothing left to read"
// shortcut or after reading the last window - the windows are verified, and any that are corrupt or missing simply go back on the to-do list.
// So a damaged window can delay a book but can never strand it.
import { planWindows, type OcrWindowFile } from "@/lib/rag/ocr";
import type { PdfFetch } from "@/lib/rag/pdf-cache";
import type { PageRenderer } from "@/lib/rag/ocr-render";
import { StorageBlockedError } from "@/lib/storage/blocked";
import { DOWNLOAD_BUDGET_MESSAGE, DOWNLOAD_BUDGET_UNAVAILABLE_MESSAGE, OCR_STORAGE_UNAVAILABLE_MESSAGE, STORAGE_BLOCKED_MESSAGE } from "@/lib/storage/stop-messages";

export interface OcrProgress {
  pagesDone: number;
  totalPages: number;
  complete: boolean;
  /** The AI reader refused for quota and nothing could be read this call: stop and come back later. */
  quotaExhausted: boolean;
  /** Windows that came back unusable this call (they stay unread and are retried next time). */
  failedWindows: number;
}

export type OcrRunResult = { ok: true; data: OcrProgress } | { ok: false; error: string };

export interface OcrRunDeps {
  /** Pages in the book, when an earlier call already recorded it (from the saved status). Lets a finished run end without any download. */
  knownTotalPages: number | null;
  /** Pages whose window files EXIST (names only - cheap). */
  getSavedPages(): Promise<Set<number>>;
  /** Pages whose window files were read back and checked. Throws on a temporary problem or a blocked store. */
  verifySaved(): Promise<{ validPages: Set<number>; totalPages: number | null }>;
  saveWindow(window: OcrWindowFile): Promise<void>;
  getPdf(): Promise<PdfFetch>;
  /** Books up to this size are first checked for a usable text layer, once, before any OCR is spent on them. */
  maxDirectBytes: number;
  textLayerUsable(bytes: Uint8Array): Promise<boolean>;
  openRenderer(bytes: Uint8Array): Promise<PageRenderer>;
  readWindow(images: { page: number; png: Uint8Array }[], firstModel: number): Promise<{ pages: string[]; model: string }>;
  validate(pages: string[]): { ok: true } | { ok: false; reason: string };
  isQuotaFailure(reason: unknown): boolean;
  recordStatus(pagesDone: number, totalPages: number): Promise<void>;
  onComplete?(totalPages: number): Promise<void>;
  now(): number;
  startedAt: number;
  callBudgetMs: number;
  batchAllowanceMs: number;
  parallelWindows: number;
}

const allSaved = (saved: Set<number>, total: number) => {
  for (let p = 1; p <= total; p++) if (!saved.has(p)) return false;
  return true;
};

/** Runs a storage step, turning every failure into a message: blocked -> stop, anything else -> a temporary problem (nothing changed). */
async function storageStep<T>(step: () => Promise<T>): Promise<{ ok: true; value: T } | { ok: false; error: string }> {
  try {
    return { ok: true, value: await step() };
  } catch (e) {
    return { ok: false, error: e instanceof StorageBlockedError ? STORAGE_BLOCKED_MESSAGE : OCR_STORAGE_UNAVAILABLE_MESSAGE };
  }
}

export async function runOcrPass(deps: OcrRunDeps): Promise<OcrRunResult> {
  const first = await storageStep(() => deps.getSavedPages());
  if (!first.ok) return first;
  let saved = first.value;
  let verified = false;

  /** Replaces `saved` with only the pages whose files check out. Returns an error message if that could not be done. */
  const verify = async (bookPages: number | null): Promise<string | null> => {
    const v = await storageStep(() => deps.verifySaved());
    if (!v.ok) return v.error;
    // Windows that describe a different page count than this book belong to some other file: none of them count.
    saved = bookPages !== null && v.value.totalPages !== null && v.value.totalPages !== bookPages ? new Set() : new Set(v.value.validPages);
    verified = true;
    return null;
  };

  // Nothing left to read (by the cheap measure): confirm with the strong one, and only then finish without downloading the book.
  if (deps.knownTotalPages !== null && allSaved(saved, deps.knownTotalPages)) {
    const problem = await verify(deps.knownTotalPages);
    if (problem) return { ok: false, error: problem };
    if (allSaved(saved, deps.knownTotalPages)) {
      await deps.recordStatus(deps.knownTotalPages, deps.knownTotalPages);
      return { ok: true, data: { pagesDone: deps.knownTotalPages, totalPages: deps.knownTotalPages, complete: true, quotaExhausted: false, failedWindows: 0 } };
    }
    // Some saved windows were not usable: carry on - their pages are back on the to-do list.
  }

  const got = await deps.getPdf();
  if (!got.ok) {
    if (got.reason === "blocked") return { ok: false, error: STORAGE_BLOCKED_MESSAGE };
    if (got.reason === "budget") return { ok: false, error: DOWNLOAD_BUDGET_MESSAGE };
    if (got.reason === "budget_unavailable") return { ok: false, error: DOWNLOAD_BUDGET_UNAVAILABLE_MESSAGE };
    return { ok: false, error: got.reason === "too_big" ? "This file is larger than the upload limit." : "The stored file could not be downloaded." };
  }
  const bytes = got.bytes;
  const sha = got.sha256; // the true hash of the file as downloaded - taken by the downloader before anything could touch the bytes

  // Only a book that cannot be read directly is read with OCR - it costs AI calls. Checked once, before the first page is read.
  if (saved.size === 0 && bytes.length <= deps.maxDirectBytes && (await deps.textLayerUsable(bytes))) {
    return { ok: false, error: "This PDF already has readable text, so reading it page by page is not needed. Use Continue indexing." };
  }

  let renderer: PageRenderer;
  try {
    renderer = await deps.openRenderer(bytes);
  } catch {
    return { ok: false, error: "This PDF could not be opened to read its pages." };
  }
  try {
    const totalPages = renderer.pageCount;
    const pending = () =>
      planWindows(totalPages).filter((w) => {
        for (let p = w.start; p <= w.end; p++) if (!saved.has(p)) return true;
        return false;
      });
    let todo = pending();
    if (todo.length === 0 && !verified) {
      // By the cheap measure everything is read: check before believing it.
      const problem = await verify(totalPages);
      if (problem) return { ok: false, error: problem };
      todo = pending();
    }

    const read = new Set(saved); // verified pages plus the ones saved during this call - no further listing needed
    let failedWindows = 0;
    let savedThisCall = 0;
    let quotaHit = false;
    let blocked = false;
    let lastReason = "";

    for (let i = 0; i < todo.length && !quotaHit && !blocked; i += deps.parallelWindows) {
      if (i > 0 && deps.now() + deps.batchAllowanceMs > deps.startedAt + deps.callBudgetMs) break;
      const batch = todo.slice(i, i + deps.parallelWindows);
      // Render in turn (CPU-bound), read in parallel (network-bound).
      const rendered: { start: number; end: number; images: { page: number; png: Uint8Array }[] }[] = [];
      for (const w of batch) {
        const images: { page: number; png: Uint8Array }[] = [];
        for (let p = w.start; p <= w.end; p++) images.push({ page: p, png: await renderer.renderPng(p) });
        rendered.push({ ...w, images });
      }
      const outcomes = await Promise.allSettled(
        rendered.map(async (w) => {
          const { pages, model } = await deps.readWindow(w.images, w.start);
          const check = deps.validate(pages);
          if (!check.ok) throw new Error(check.reason);
          await deps.saveWindow({ version: 1, totalPages, startPage: w.start, endPage: w.end, pages, sourceSha256: sha, model });
          for (let p = w.start; p <= w.end; p++) read.add(p);
        }),
      );
      for (const o of outcomes) {
        if (o.status === "fulfilled") savedThisCall++;
        else {
          failedWindows++;
          if (o.reason instanceof StorageBlockedError) blocked = true;
          lastReason = o.reason instanceof Error ? o.reason.message : "A window could not be read.";
          if (deps.isQuotaFailure(o.reason)) quotaHit = true;
        }
      }
      if (savedThisCall === 0 && failedWindows >= batch.length) break; // nothing worked: do not keep spending calls
    }

    let pagesDone = 0;
    for (let p = 1; p <= totalPages; p++) if (read.has(p)) pagesDone++;

    // About to declare the book complete on the strength of file names: read them back first.
    if (!blocked && pagesDone >= totalPages && !verified) {
      const problem = await verify(totalPages); // reads every window back, including the ones just saved
      if (problem) return { ok: false, error: problem }; // the windows stay saved; the next pass confirms them
      read.clear();
      for (const p of saved) read.add(p);
      pagesDone = 0;
      for (let p = 1; p <= totalPages; p++) if (read.has(p)) pagesDone++;
    }
    const complete = pagesDone >= totalPages;

    // What was saved stays saved: the status always reflects it, even when the pass ended early.
    if (!blocked || savedThisCall > 0) await deps.recordStatus(pagesDone, totalPages);
    if (blocked) return { ok: false, error: STORAGE_BLOCKED_MESSAGE };
    if (complete && savedThisCall > 0) await deps.onComplete?.(totalPages);
    // Nothing could be read for a reason other than quota: an error (the admin screen may retry once). When it was QUOTA, fall through to the
    // normal result below, which carries quotaExhausted - the screen stops at once and says so, instead of retrying a limit that resets daily.
    if (savedThisCall === 0 && !complete && failedWindows > 0 && !quotaHit) {
      return { ok: false, error: `The pages could not be read this time (${lastReason}). Everything read so far is saved.` };
    }
    return { ok: true, data: { pagesDone, totalPages, complete, quotaExhausted: quotaHit && savedThisCall === 0, failedWindows } };
  } finally {
    renderer.close();
  }
}
