// The admin screen's "read the pages" loop, as a function of its dependencies so its decisions can be tested without a browser: call the OCR
// action; a failed call is retried at most ONCE; a quota result stops at once; a stop message (storage blocked / download budget) stops at once;
// otherwise keep going while pages are being saved. It never throws and never hides a failure: every ending is described, with the saved progress.
import type { OcrProgress } from "@/lib/rag/ocr-run";
import { isStorageStopMessage } from "@/lib/storage/stop-messages";

export type OcrCallResult = { ok: true; data?: OcrProgress } | { ok: false; error: string };

/** What the screen says when an OCR call was thrown or cut off (the platform's time limit, a dropped connection) and no answer came back. */
export const OCR_INTERRUPTED_MESSAGE = "The request was interrupted before it finished (a timeout or a connection problem). Pages already read are saved.";

export type SavedProgress = { done: number; total: number } | null;

export type OcrOutcome =
  | { kind: "complete"; totalPages: number }
  | { kind: "quota"; progress: SavedProgress }
  | { kind: "failed"; error: string; stopped: boolean; progress: SavedProgress }
  | { kind: "unfinished"; progress: SavedProgress };

export interface OcrLoopDeps {
  /** One call of the OCR action. Must resolve to a result - a thrown call is turned into `{ ok: false }` by the caller (see OCR_INTERRUPTED_MESSAGE). */
  call(): Promise<OcrCallResult>;
  pause(ms: number): Promise<unknown>;
  onProgress?(done: number, total: number): void;
  /** Progress already saved before this run (from the material's status), used in messages when a failed call carries none. */
  known?: SavedProgress;
}

export async function driveOcr(deps: OcrLoopDeps): Promise<OcrOutcome> {
  let progress: SavedProgress = deps.known ?? null;
  let res = await deps.call();
  let stalled = 0;
  let lastDone = -1;
  for (let round = 0; round < 120; round++) {
    if (res.ok && res.data?.complete) return { kind: "complete", totalPages: res.data.totalPages };
    if (!res.ok) {
      // A storage / budget stop is final. Anything else (the reader was busy, the call was cut off) gets ONE more try: each try costs a file
      // download and a round of AI requests, and the saved pages are never lost, so "Continue reading pages" can resume later.
      if (isStorageStopMessage(res.error)) return { kind: "failed", error: res.error, stopped: true, progress };
      stalled++;
      if (stalled >= 2) return { kind: "failed", error: res.error, stopped: false, progress };
      await deps.pause(20_000);
      res = await deps.call();
      continue;
    }
    if (!res.data) return { kind: "unfinished", progress };
    const { pagesDone, totalPages, quotaExhausted } = res.data;
    progress = { done: pagesDone, total: totalPages };
    deps.onProgress?.(pagesDone, totalPages);
    if (quotaExhausted) return { kind: "quota", progress };
    stalled = pagesDone === lastDone ? stalled + 1 : 0;
    lastDone = pagesDone;
    if (stalled >= 4) return { kind: "unfinished", progress }; // windows are saved as read, so stopping loses nothing
    await deps.pause(stalled > 0 ? Math.min(60_000, 10_000 * 2 ** stalled) : 500);
    res = await deps.call();
  }
  return { kind: "unfinished", progress };
}

/** Wording for an outcome that is NOT a success, for a warning toast and the note kept under the material. `null` for a completed run. */
export function describeOcrOutcome(outcome: OcrOutcome): { title: string; detail: string } | null {
  if (outcome.kind === "complete") return null;
  const p = outcome.progress;
  const saved = p && p.total > 0 ? `${p.done} / ${p.total} pages are saved.` : "Pages read so far are saved.";
  if (outcome.kind === "quota") return { title: "AI provider limit reached", detail: `The AI reader is out of quota for now. ${saved} Try "Continue reading pages" again later.` };
  if (outcome.kind === "unfinished") return { title: "Reading is not finished yet", detail: `${saved} Click "Continue reading pages" to carry on.` };
  if (outcome.stopped) return { title: "Reading stopped", detail: `${outcome.error} ${saved}` };
  if (outcome.error === OCR_INTERRUPTED_MESSAGE) return { title: "The request was interrupted", detail: `${outcome.error} ${saved} Try again.` };
  return { title: "Could not read the pages", detail: `${outcome.error} ${saved} Try again later.` };
}
