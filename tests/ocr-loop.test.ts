// Offline tests for the admin screen's page-reading loop decisions (lib/rag/ocr-loop.ts): retry a failed call at most ONCE, stop at once on quota
// or on a storage stop message, never turn a failure into "ok, no progress", and always describe a non-success with the saved progress.
// The action itself is a fake: nothing here runs OCR, calls Gemini, or touches storage or a database.
import { test } from "node:test";
import assert from "node:assert/strict";

import { OCR_INTERRUPTED_MESSAGE, describeOcrOutcome, driveOcr, type OcrCallResult } from "@/lib/rag/ocr-loop";
import { DOWNLOAD_BUDGET_MESSAGE, STORAGE_BLOCKED_MESSAGE } from "@/lib/storage/stop-messages";

const progress = (pagesDone: number, totalPages = 90, over: Partial<{ complete: boolean; quotaExhausted: boolean }> = {}): OcrCallResult => ({
  ok: true,
  data: { pagesDone, totalPages, complete: over.complete ?? pagesDone >= totalPages, quotaExhausted: over.quotaExhausted ?? false, failedWindows: 0 },
});
const failed = (error: string): OcrCallResult => ({ ok: false, error });

/** Runs the loop against a scripted list of results, recording how many calls were made and every pause. */
async function run(script: OcrCallResult[], known: { done: number; total: number } | null = null) {
  const pauses: number[] = [];
  const progressed: [number, number][] = [];
  let calls = 0;
  const outcome = await driveOcr({
    call: async () => script[Math.min(calls++, script.length - 1)],
    pause: async (ms) => void pauses.push(ms),
    onProgress: (d, t) => progressed.push([d, t]),
    known,
  });
  return { outcome, calls, pauses, progressed };
}

test("a pass that finishes the book ends the loop with no pause", async () => {
  const r = await run([progress(90)]);
  assert.deepEqual(r.outcome, { kind: "complete", totalPages: 90 });
  assert.equal(r.calls, 1);
  assert.deepEqual(r.pauses, []);
  assert.equal(describeOcrOutcome(r.outcome), null);
});

test("QUOTA stops at once: one call, no pause, no retry - and the message carries the saved progress", async () => {
  const r = await run([progress(89, 90, { quotaExhausted: true })]);
  assert.deepEqual(r.outcome, { kind: "quota", progress: { done: 89, total: 90 } });
  assert.equal(r.calls, 1);
  assert.deepEqual(r.pauses, []);
  const note = describeOcrOutcome(r.outcome);
  assert.ok(note && note.title === "AI provider limit reached" && note.detail.includes("89 / 90 pages are saved"));
});

test("a FAILED call (reader busy) is retried exactly ONCE, after one pause, then reported as failed", async () => {
  const busy = failed("The pages could not be read this time (The AI reader is busy right now.). Everything read so far is saved.");
  const r = await run([busy], { done: 89, total: 90 });
  assert.equal(r.calls, 2, "the first try plus one retry - never more");
  assert.deepEqual(r.pauses, [20_000]);
  assert.equal(r.outcome.kind, "failed");
  assert.ok(r.outcome.kind === "failed" && !r.outcome.stopped && r.outcome.progress?.done === 89);
  const note = describeOcrOutcome(r.outcome);
  assert.ok(note && note.title === "Could not read the pages" && note.detail.includes("89 / 90 pages are saved"));
});

test("a failure followed by a good retry carries on normally", async () => {
  const r = await run([failed("busy"), progress(90)]);
  assert.deepEqual(r.outcome, { kind: "complete", totalPages: 90 });
  assert.equal(r.calls, 2);
});

test("an INTERRUPTED call is a failure, not 'ok with no progress': it is retried once, then shown as interrupted with the known progress", async () => {
  const r = await run([failed(OCR_INTERRUPTED_MESSAGE)], { done: 89, total: 90 });
  assert.equal(r.calls, 2);
  assert.ok(r.outcome.kind === "failed" && r.outcome.error === OCR_INTERRUPTED_MESSAGE);
  const note = describeOcrOutcome(r.outcome);
  assert.ok(note && note.title === "The request was interrupted" && note.detail.includes("89 / 90 pages are saved"));
});

test("a storage-blocked / download-budget message STOPS: one call, no pause, no retry", async () => {
  for (const message of [STORAGE_BLOCKED_MESSAGE, DOWNLOAD_BUDGET_MESSAGE]) {
    const r = await run([failed(message)], { done: 45, total: 90 });
    assert.equal(r.calls, 1);
    assert.deepEqual(r.pauses, []);
    assert.ok(r.outcome.kind === "failed" && r.outcome.stopped);
    const note = describeOcrOutcome(r.outcome);
    assert.ok(note && note.title === "Reading stopped" && note.detail.includes(message) && note.detail.includes("45 / 90"));
  }
});

test("progress keeps the loop going and is reported as it happens; the final answer decides the ending", async () => {
  const r = await run([progress(10), progress(20), progress(90)]);
  assert.deepEqual(r.outcome, { kind: "complete", totalPages: 90 });
  assert.deepEqual(r.progressed, [[10, 90], [20, 90]]); // the finishing answer ends the loop; indexing then takes over the progress display
  assert.equal(r.calls, 3);
  assert.deepEqual(r.pauses, [500, 500]);
});

test("passes that save nothing new stop after a few tries and say so (unfinished), with the saved progress", async () => {
  const r = await run([progress(88)]);
  assert.equal(r.outcome.kind, "unfinished");
  assert.equal(r.calls, 5, "the existing no-progress limit is unchanged");
  assert.deepEqual(r.pauses, [500, 20_000, 40_000, 60_000]);
  const note = describeOcrOutcome(r.outcome);
  assert.ok(note && note.title === "Reading is not finished yet" && note.detail.includes("88 / 90 pages are saved"));
});

test("a failure with no known progress still gives a safe, readable message", () => {
  const note = describeOcrOutcome({ kind: "failed", error: "Material not found.", stopped: false, progress: null });
  assert.ok(note && note.detail.includes("Pages read so far are saved") && note.detail.includes("Material not found."));
});
