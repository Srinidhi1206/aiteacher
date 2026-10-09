// Regression tests for OCR resumability and error handling (offline: fake storage, fake network, no database, no AI):
//  * a saved window only counts once it has been read back and checked - a corrupt one never declares a book complete, never shadows a good one;
//  * a TEMPORARY storage problem is "unavailable" - never mistaken for "no OCR text" - and triggers no PDF download and no status change;
//  * the "nothing left to read" shortcut verifies first, so a damaged window can delay a book but never strand it;
//  * recoverable errors never erase the OCR markers in the saved status.
// Run:  npm run test:storage
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

import { createOcrStore, OcrStorageUnavailableError, validateWindowFile, type OcrStorage } from "@/lib/rag/ocr-store-core";
import { runOcrPass, type OcrRunDeps } from "@/lib/rag/ocr-run";
import { ocrRepairStatus, resolveIndexSource, type IndexSourceDeps } from "@/lib/rag/index-source";
import { formatIndexStatus, hasOcrMarker, mayWriteOcrStatus, shouldRecordFailure } from "@/lib/rag/index-status";
import { StorageBlockedError, isStorageBreakerOpen, resetStorageBreaker } from "@/lib/storage/blocked";
import { OCR_STORAGE_UNAVAILABLE_MESSAGE, STORAGE_BLOCKED_MESSAGE } from "@/lib/storage/stop-messages";
import { UNREADABLE_TEXT_MESSAGE } from "@/lib/rag/text-quality";
import type { OcrWindowFile } from "@/lib/rag/ocr";
import type { PdfFetch } from "@/lib/rag/pdf-cache";
import { EMPTY_SHA, HEX_A, HEX_B, MB, fakeNetwork, fakeOcrStorage, fakeRenderer, passHarness, win } from "./helpers";

beforeEach(() => resetStorageBreaker());

const store = (f: ReturnType<typeof fakeOcrStorage>) => createOcrStore({ storage: f.storage, fetchFn: f.net.fetchFn });

// ---------- validation: a file that merely EXISTS is not "a page read" ----------

test("validateWindowFile accepts exactly what the OCR pass writes and rejects every malformed variant", () => {
  const good = win(3, 4).file;
  assert.ok(validateWindowFile(good, { start: 3, end: 4 }));
  const bad: [string, unknown][] = [
    ["not an object", "x"],
    ["null", null],
    ["wrong version", { ...good, version: 2 }],
    ["file describes other pages than its name", good],
    ["page count does not match its range", { ...good, pages: ["only one"] }],
    ["a page that is not text", { ...good, pages: ["ok", 5] }],
    ["range outside the book", { ...good, endPage: 9, pages: new Array(6).fill("x") }],
    ["empty-input hash (a detached buffer was hashed)", { ...good, sourceSha256: EMPTY_SHA }],
    ["hash that is not a SHA-256", { ...good, sourceSha256: "sha-a" }],
    ["no hash", { ...good, sourceSha256: undefined }],
  ];
  for (const [label, raw] of bad) {
    const range = label.startsWith("file describes") ? { start: 5, end: 6 } : { start: 3, end: 4 };
    assert.equal(validateWindowFile(raw, range), null, label);
  }
});

test("a corrupt window is not 'read': the book is incomplete, and the good windows are still counted", async () => {
  const f = fakeOcrStorage([win(1, 2), { name: "w3-4-xyz.json", raw: "{ this is not json" }, win(5, 6)]);
  const s = store(f);
  assert.deepEqual(await s.readOcrState("m1"), { kind: "incomplete", validPages: 4, totalPages: 6 });
  const v = await s.verifySaved("m1");
  assert.deepEqual([...v.validPages].sort(), [1, 2, 5, 6].map(Number).sort());
});

test("a corrupt file never shadows a good one for the same pages: the good one is used", async () => {
  const good = win(3, 4);
  const f = fakeOcrStorage([win(1, 2), { name: "w3-4-aaa.json", raw: "garbage" }, { name: "w3-4-bbb.json", file: good.file }, win(5, 6)]);
  const state = await store(f).readOcrState("m1");
  assert.equal(state.kind, "complete");
});

test("a window file with the wrong shape, an empty-input hash or the wrong range does not count", async () => {
  const f = fakeOcrStorage([win(1, 2), { name: "w3-4-xyz.json", file: { ...win(3, 4).file, sourceSha256: EMPTY_SHA } }, { name: "w5-6-xyz.json", file: win(1, 2).file }]);
  assert.deepEqual(await store(f).readOcrState("m1"), { kind: "incomplete", validPages: 2, totalPages: 6 });
});

test("a window listed but gone (404) is a missing page - recoverable - not a temporary problem", async () => {
  const f = fakeOcrStorage([win(1, 2), win(3, 4), { name: "w5-6-xyz.json", status: 404 }]);
  assert.deepEqual(await store(f).readOcrState("m1"), { kind: "incomplete", validPages: 4, totalPages: 6 });
});

test("windows that describe a different book than most of the others are ignored, never mixed in", async () => {
  const f = fakeOcrStorage([win(1, 2, 6, HEX_A), win(3, 4, 6, HEX_A), win(5, 6, 6, HEX_B)]);
  assert.deepEqual(await store(f).readOcrState("m1"), { kind: "incomplete", validPages: 4, totalPages: 6 });
});

// ---------- a temporary storage problem is its own answer ----------

test("a window that cannot be read just now (HTTP 503 / network error) makes the state 'unavailable', not 'incomplete' or 'none'", async () => {
  for (const flaky of [{ name: "w3-4-xyz.json", status: 503 }, { name: "w3-4-xyz.json", throws: true }]) {
    const f = fakeOcrStorage([win(1, 2), flaky, win(5, 6)]);
    const s = store(f);
    assert.deepEqual(await s.readOcrState("m1"), { kind: "unavailable" });
    await assert.rejects(() => s.verifySaved("m1"), OcrStorageUnavailableError);
  }
});

test("a temporary LISTING error is 'unavailable' (it used to read as 'no OCR text')", async () => {
  const f = fakeOcrStorage([], { listError: new Error("503 from the store") });
  assert.deepEqual(await store(f).readOcrState("m1"), { kind: "unavailable" });
});

test("nothing stored is 'none'; a blocked store still throws and opens the breaker", async () => {
  assert.deepEqual(await store(fakeOcrStorage([])).readOcrState("m1"), { kind: "none" });
  const blocked = fakeOcrStorage([win(1, 6)], { blockedFetch: true });
  await assert.rejects(() => store(blocked).readOcrState("m1"), StorageBlockedError);
  assert.ok(isStorageBreakerOpen());
});

test("only a COMPLETE run is remembered: an incomplete or unavailable answer is asked again next time", async () => {
  const f = fakeOcrStorage([win(1, 2), win(5, 6)]);
  const s = store(f);
  await s.readOcrState("m1");
  await s.readOcrState("m1");
  assert.equal(f.lists.length, 2);
});

test("book identity skips a corrupt first window; only-temporary trouble throws 'unavailable'; nothing stored is null", async () => {
  const f = fakeOcrStorage([{ name: "w1-2-aaa.json", raw: "garbage" }, win(3, 4, 6, HEX_B)]);
  assert.deepEqual(await store(f).readOcrIdentity("m1"), { sourceSha256: HEX_B, totalPages: 6 });
  await assert.rejects(() => store(fakeOcrStorage([{ name: "w1-2-aaa.json", status: 503 }])).readOcrIdentity("m1"), OcrStorageUnavailableError);
  assert.equal(await store(fakeOcrStorage([])).readOcrIdentity("m1"), null);
});

// ---------- the OCR pass: verify before believing, never strand ----------

test("the shortcut VERIFIES first: every saved window checks out -> finished with no download", async () => {
  const h = passHarness({ saved: [1, 2, 3, 4, 5, 6], knownTotalPages: 6 });
  const r = await runOcrPass(h.deps);
  assert.ok(r.ok && r.data.complete);
  assert.equal(h.log.verifies, 1);
  assert.equal(h.log.pdf, 0);
});

test("a damaged saved window does NOT strand the book: names say complete, verification says otherwise, so it is downloaded and only that window is re-read", async () => {
  // pages 3-4 have a file, but it is unusable: they are not among the verified pages
  const h = passHarness({ saved: [1, 2, 3, 4, 5, 6], valid: [1, 2, 5, 6], knownTotalPages: 6 });
  const r = await runOcrPass(h.deps);
  assert.ok(r.ok, JSON.stringify(r));
  assert.equal(h.log.pdf, 1, "one budgeted download, because something really is left to read");
  assert.deepEqual(h.log.reads, [3], "only the damaged window is read again; the good ones are not");
  assert.deepEqual(h.log.saves, [3]);
});

test("with the status lost (no known total), names-complete is still verified before 'complete' is claimed", async () => {
  const h = passHarness({ saved: [1, 2, 3, 4, 5, 6], valid: [1, 2, 5, 6], knownTotalPages: null });
  const r = await runOcrPass(h.deps);
  assert.ok(r.ok);
  assert.equal(h.log.verifies >= 1, true);
  assert.deepEqual(h.log.reads, [3]);
});

test("after reading the last window the book is verified before it is declared complete; a bad window keeps it in progress", async () => {
  // pages 5-6 are read this call; verification afterwards finds pages 1-2 unusable
  const h = passHarness({ saved: [1, 2, 3, 4], valid: [3, 4, 5, 6] });
  const r = await runOcrPass(h.deps);
  assert.ok(r.ok && !r.data.complete, "not complete: pages 1-2 are not usable");
  assert.equal(r.ok && r.data.pagesDone, 4);
  assert.deepEqual(h.log.statuses.at(-1), [4, 6], "the status tells the truth, so the admin screen offers to continue");
});

test("windows that describe another book (a different page count) never count: everything is read again", async () => {
  const h = passHarness({ saved: [1, 2, 3, 4, 5, 6], valid: [1, 2, 3, 4, 5, 6], validTotal: 40, knownTotalPages: 6 });
  const r = await runOcrPass(h.deps);
  assert.ok(r.ok);
  assert.deepEqual([...h.log.reads].sort(), [1, 3, 5]);
});

test("a temporary problem while verifying: nothing downloaded, nothing read, no status written, a retryable message", async () => {
  const h = passHarness({ saved: [1, 2, 3, 4, 5, 6], knownTotalPages: 6, verifySaved: async () => Promise.reject(new OcrStorageUnavailableError()) });
  assert.deepEqual(await runOcrPass(h.deps), { ok: false, error: OCR_STORAGE_UNAVAILABLE_MESSAGE });
  assert.equal(h.log.pdf, 0);
  assert.deepEqual(h.log.statuses, []);
});

test("a temporary problem listing saved pages is a message, not a thrown error; no PDF fetch, no status change", async () => {
  const h = passHarness({ getSavedPages: async () => Promise.reject(new Error("503 from storage")) });
  assert.deepEqual(await runOcrPass(h.deps), { ok: false, error: OCR_STORAGE_UNAVAILABLE_MESSAGE });
  assert.equal(h.log.pdf, 0);
  assert.deepEqual(h.log.statuses, []);
});

test("blocked storage while verifying is a STOP", async () => {
  const h = passHarness({ saved: [1, 2, 3, 4, 5, 6], knownTotalPages: 6, verifySaved: async () => Promise.reject(new StorageBlockedError()) });
  assert.deepEqual(await runOcrPass(h.deps), { ok: false, error: STORAGE_BLOCKED_MESSAGE });
  assert.equal(h.log.pdf, 0);
});

// ---------- end to end with the REAL store logic: a corrupt window heals ----------

/** A small in-memory file store: uploads become listable and servable, so a pass can really repair a damaged run. */
function statefulStorage(initial: { name: string; raw: string }[]) {
  const files = new Map(initial.map((f) => [f.name, f.raw]));
  const storage: OcrStorage = {
    async list(prefix) {
      return [...files.keys()].map((n) => ({ pathname: `${prefix}${n}`, url: `https://store.example/${n}` }));
    },
    async upload({ file, pathname }) {
      files.set(pathname.split("/").pop() as string, await file.text());
    },
    async delete() {},
  };
  const net = fakeNetwork((url) => {
    const raw = files.get(url.split("/").pop() as string);
    return raw === undefined ? new Response("", { status: 404 }) : new Response(raw, { status: 200 });
  });
  return { storage, net, files };
}

test("END TO END: a book with one corrupt window and a 'ready' status is repaired by the next pass and then indexes - never stranded", async () => {
  const w = (a: number, b: number): { name: string; raw: string } => ({ name: `w${a}-${b}-xyz.json`, raw: JSON.stringify(win(a, b).file) });
  const fake = statefulStorage([w(1, 2), { name: "w3-4-xyz.json", raw: "{ truncated" }, w(5, 6)]);
  const real = createOcrStore({ storage: fake.storage, fetchFn: fake.net.fetchFn });
  assert.equal((await real.readOcrState("m1")).kind, "incomplete"); // indexing would say: needs reading

  let pdfFetches = 0;
  const reads: number[] = [];
  const result = await runOcrPass({
    knownTotalPages: 6, // the status said "ready"
    getSavedPages: () => real.savedPages("m1"),
    verifySaved: () => real.verifySaved("m1"),
    saveWindow: (window: OcrWindowFile) => real.saveWindow("m1", window),
    getPdf: async () => (pdfFetches++, { ok: true as const, bytes: new Uint8Array(100), sha256: HEX_A, fromCache: false }),
    maxDirectBytes: 40 * MB,
    textLayerUsable: async () => false,
    openRenderer: async () => fakeRenderer(6),
    readWindow: async (images) => (reads.push(images[0].page), { pages: images.map((i) => `text ${i.page}`), model: "m" }),
    validate: () => ({ ok: true }),
    isQuotaFailure: () => false,
    recordStatus: async () => {},
    now: () => 0,
    startedAt: 0,
    callBudgetMs: 50_000,
    batchAllowanceMs: 30_000,
    parallelWindows: 3,
  });
  assert.ok(result.ok && result.data.complete, JSON.stringify(result));
  assert.equal(pdfFetches, 1);
  assert.deepEqual(reads, [3], "only the damaged window was read again");
  const after = await real.readOcrState("m1");
  assert.equal(after.kind, "complete", "the corrupt file is still listed, but the good re-read one is used");
  assert.ok(after.kind === "complete" && after.pages.length === 6);
});

// ---------- indexing: nothing is lost or downloaded because of a hiccup ----------

function sourceHarness(over: Partial<IndexSourceDeps> & { state?: Awaited<ReturnType<IndexSourceDeps["loadOcr"]>> } = {}) {
  const log = { pdf: 0, ocr: 0 };
  const deps: IndexSourceDeps = {
    material: { id: "m1", sizeKb: 4500, indexError: formatIndexStatus({ kind: "ocr_ready", total: 6 }) },
    maxDirectBytes: 40 * MB,
    loadOcr: async () => (log.ocr++, over.state ?? { kind: "none" }),
    getPdf: async () => (log.pdf++, { ok: true as const, bytes: new Uint8Array(10), sha256: HEX_A, fromCache: true }),
    extractPages: async () => ["symbol soup"],
    textIsReadable: () => false,
    ...over,
  };
  return { deps, log };
}

test("an OCR-marked book whose saved results cannot be read right now: a transient answer, NO PDF download, nothing to record", async () => {
  const h = sourceHarness({ state: { kind: "unavailable" } });
  assert.deepEqual(await resolveIndexSource(h.deps), { ok: false, kind: "transient", message: OCR_STORAGE_UNAVAILABLE_MESSAGE });
  assert.equal(h.log.pdf, 0);
});

test("an OCR-marked book with a partly unusable run reports the true progress and downloads nothing", async () => {
  const h = sourceHarness({ state: { kind: "incomplete", validPages: 4, totalPages: 6 } });
  const r = await resolveIndexSource(h.deps);
  assert.deepEqual(r, { ok: false, kind: "ocr_incomplete", message: UNREADABLE_TEXT_MESSAGE, progress: { done: 4, total: 6 } });
  assert.equal(h.log.pdf, 0);
});

test("an OCR-marked book whose results are gone is 'ocr_incomplete' (keeps its marker), not a plain failure", async () => {
  const h = sourceHarness({ state: { kind: "none" } });
  const r = await resolveIndexSource(h.deps);
  assert.ok(!r.ok && r.kind === "ocr_incomplete");
  assert.equal(h.log.pdf, 0);
});

test("an unreadable PDF with a TEMPORARY OCR-store problem is transient - not reported as 'old font encoding'", async () => {
  const h = sourceHarness({ state: { kind: "unavailable" }, material: { id: "m1", sizeKb: 4500, indexError: null } });
  const r = await resolveIndexSource(h.deps);
  assert.deepEqual(r, { ok: false, kind: "transient", message: OCR_STORAGE_UNAVAILABLE_MESSAGE });
  assert.equal(h.log.pdf, 1, "the PDF was needed to find out it is unreadable (one budgeted download), and nothing was recorded");
});

// ---------- status markers survive recoverable errors ----------

test("OCR markers are recognised; ordinary and old statuses are not", () => {
  assert.ok(hasOcrMarker(formatIndexStatus({ kind: "ocr_ready", total: 90 })));
  assert.ok(hasOcrMarker(formatIndexStatus({ kind: "ocr_progress", done: 4, total: 90 })));
  assert.ok(hasOcrMarker("Indexing in progress: 90 / 219 passages (from OCR)."));
  assert.equal(hasOcrMarker("Indexing in progress: 90 / 219 passages."), false);
  assert.equal(hasOcrMarker("Complete: 648 / 648 passages."), false);
  assert.equal(hasOcrMarker(null), false);
});

test("an ordinary failure is NOT recorded over an OCR-marked status (so the marker survives), but is recorded over anything else", () => {
  for (const marked of [formatIndexStatus({ kind: "ocr_ready", total: 6 }), formatIndexStatus({ kind: "ocr_progress", done: 2, total: 6 }), "Indexing in progress: 9 / 99 passages (from OCR)."]) {
    assert.equal(shouldRecordFailure(marked), false, marked);
  }
  for (const other of [null, "The stored file could not be downloaded.", "Indexing in progress: 120 / 1933 passages.", "Complete: 934 / 934 passages."]) {
    assert.equal(shouldRecordFailure(other), true, String(other));
  }
});

test("page-reading may write its status over its own states and errors, never over indexing progress or a finished book", () => {
  assert.equal(mayWriteOcrStatus(null), true);
  assert.equal(mayWriteOcrStatus(formatIndexStatus({ kind: "ocr_progress", done: 1, total: 6 })), true);
  assert.equal(mayWriteOcrStatus(UNREADABLE_TEXT_MESSAGE), true);
  assert.equal(mayWriteOcrStatus("Indexing in progress: 9 / 99 passages (from OCR)."), false);
  assert.equal(mayWriteOcrStatus("Indexing in progress: 120 / 1933 passages."), false);
  assert.equal(mayWriteOcrStatus("Complete: 934 / 934 passages."), false);
  assert.equal(mayWriteOcrStatus("Partial: indexed the first 2500 of 3000 passages (the per-material limit was reached)."), false);
});

test("a 'ready' status found to be false is repaired to the true progress - and nothing else is ever overwritten", () => {
  const ready = formatIndexStatus({ kind: "ocr_ready", total: 6 });
  assert.equal(ocrRepairStatus(ready, { done: 4, total: 6 }), "Reading pages (OCR): 4 / 6 pages.");
  assert.equal(ocrRepairStatus(ready), "Reading pages (OCR): 0 / 6 pages.", "total taken from the status when the windows give none");
  assert.equal(ocrRepairStatus(ready, { done: 6, total: 6 }), "Reading pages (OCR): 5 / 6 pages.", "never claims complete");
  assert.equal(ocrRepairStatus("Reading pages (OCR): 4 / 6 pages.", { done: 4, total: 6 }), null, "already says so: no write");
  assert.equal(ocrRepairStatus("Indexing in progress: 9 / 99 passages (from OCR).", { done: 1, total: 6 }), null, "indexing progress is never overwritten");
  assert.equal(ocrRepairStatus("Complete: 934 / 934 passages.", { done: 1, total: 6 }), null);
  assert.equal(ocrRepairStatus(null), null, "no total known: nothing to say");
});
