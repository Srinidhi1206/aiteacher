// One page-reading pass over a textbook, as a function of its dependencies (the actions in lib/actions/material-ocr.ts wire the real ones).
// The order of work is the point of this file: saved progress is looked at FIRST, and the PDF - the expensive thing to fetch - is only
// downloaded when there is genuinely something left to read. Blocked storage and an exhausted download budget end the pass at once.
import { planWindows, type OcrWindowFile } from "@/lib/rag/ocr";
import type { PdfFetch } from "@/lib/rag/pdf-cache";
import type { PageRenderer } from "@/lib/rag/ocr-render";
import { StorageBlockedError } from "@/lib/storage/blocked";
import { DOWNLOAD_BUDGET_MESSAGE, STORAGE_BLOCKED_MESSAGE } from "@/lib/storage/stop-messages";

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
  getSavedPages(): Promise<Set<number>>;
  saveWindow(window: OcrWindowFile): Promise<void>;
  getPdf(): Promise<PdfFetch>;
  /** Books up to this size are first checked for a usable text layer, once, before any OCR is spent on them. */
  maxDirectBytes: number;
  textLayerUsable(bytes: Uint8Array): Promise<boolean>;
  sha256(bytes: Uint8Array): string;
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

export async function runOcrPass(deps: OcrRunDeps): Promise<OcrRunResult> {
  let saved: Set<number>;
  try {
    saved = await deps.getSavedPages();
  } catch (e) {
    if (e instanceof StorageBlockedError) return { ok: false, error: STORAGE_BLOCKED_MESSAGE };
    throw e;
  }

  // Nothing left to read: finish without downloading the book.
  if (deps.knownTotalPages !== null && allSaved(saved, deps.knownTotalPages)) {
    await deps.recordStatus(deps.knownTotalPages, deps.knownTotalPages);
    return { ok: true, data: { pagesDone: deps.knownTotalPages, totalPages: deps.knownTotalPages, complete: true, quotaExhausted: false, failedWindows: 0 } };
  }

  const got = await deps.getPdf();
  if (!got.ok) {
    if (got.reason === "blocked") return { ok: false, error: STORAGE_BLOCKED_MESSAGE };
    if (got.reason === "budget") return { ok: false, error: DOWNLOAD_BUDGET_MESSAGE };
    return { ok: false, error: got.reason === "too_big" ? "This file is larger than the upload limit." : "The stored file could not be downloaded." };
  }
  const bytes = got.bytes;

  // Only a book that cannot be read directly is read with OCR - it costs AI calls. Checked once, before the first page is read.
  if (saved.size === 0 && bytes.length <= deps.maxDirectBytes && (await deps.textLayerUsable(bytes))) {
    return { ok: false, error: "This PDF already has readable text, so reading it page by page is not needed. Use Continue indexing." };
  }

  const sha = deps.sha256(bytes);
  let renderer: PageRenderer;
  try {
    renderer = await deps.openRenderer(bytes);
  } catch {
    return { ok: false, error: "This PDF could not be opened to read its pages." };
  }
  try {
    const totalPages = renderer.pageCount;
    const read = new Set(saved); // pages saved before this call plus the ones saved during it - no second listing needed
    const todo = planWindows(totalPages).filter((w) => {
      for (let p = w.start; p <= w.end; p++) if (!saved.has(p)) return true;
      return false;
    });
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
    const complete = pagesDone >= totalPages;
    // What was saved stays saved: the status always reflects it, even when the pass ended early.
    if (!blocked || savedThisCall > 0) await deps.recordStatus(pagesDone, totalPages);
    if (blocked) return { ok: false, error: STORAGE_BLOCKED_MESSAGE };
    if (complete && savedThisCall > 0) await deps.onComplete?.(totalPages);
    if (savedThisCall === 0 && !complete && failedWindows > 0) {
      return { ok: false, error: quotaHit ? "The AI reader is out of quota right now. Everything read so far is saved - try again later." : `The pages could not be read this time (${lastReason}). Everything read so far is saved.` };
    }
    return { ok: true, data: { pagesDone, totalPages, complete, quotaExhausted: quotaHit && savedThisCall === 0, failedWindows } };
  } finally {
    renderer.close();
  }
}
