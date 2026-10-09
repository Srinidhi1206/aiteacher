// Offline tests for the storage / indexing safety layer: the cache really prevents repeat downloads, a blocked store stops everything with no
// retry loop, the budget holds, telemetry is safe, and saved progress is preserved. Nothing here contacts Vercel Blob, Gemini, a database or the
// network: storage, `fetch` and the ledger are fakes that COUNT how often they are used, because "was it downloaded again?" is what is proved.
// (Priority-specific regression suites: pdf-buffer.test.ts, ocr-resume.test.ts, budget-and-blocked.test.ts.)
// Run:  npm run test:storage
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

import { BREAKER_MS, StorageBlockedError, guardStorage, isBlockedBlobError, isStorageBreakerOpen, resetStorageBreaker } from "@/lib/storage/blocked";
import { createMemoryLedger } from "@/lib/storage/download-budget";
import { getStorageStats, recordDownloadEvent, resetStorageStats, safeReason } from "@/lib/storage/telemetry";
import { DOWNLOAD_BUDGET_MESSAGE, STORAGE_BLOCKED_MESSAGE, isStorageStopMessage } from "@/lib/storage/stop-messages";
import { createOcrStore } from "@/lib/rag/ocr-store-core";
import { runOcrPass } from "@/lib/rag/ocr-run";
import { isAlreadyComplete, resolveIndexSource, type IndexSourceDeps } from "@/lib/rag/index-source";
import { resolveSourceSha } from "@/lib/rag/source-identity";
import { formatIndexStatus, parseIndexStatus } from "@/lib/rag/index-status";
import { StorageBlockedError as Blocked } from "@/lib/storage/blocked";
import type { PdfFetch } from "@/lib/rag/pdf-cache";
import { BUDGET, HEX_A, MB, SECRET_URL, blockedResponse, clock, downloader, fakeOcrStorage, passHarness, pdfResponse, win } from "./helpers";

beforeEach(() => {
  resetStorageBreaker();
  resetStorageStats();
});

// ---------- 1. the cache really prevents repeat downloads ----------

test("three sequential calls for one file make ONE network request", async () => {
  const d = downloader(() => pdfResponse());
  const a = await d.fetchPdf(SECRET_URL, 10 * MB, { materialId: "mat00000001" });
  const b = await d.fetchPdf(SECRET_URL, 10 * MB, { materialId: "mat00000001" });
  const c = await d.fetchPdf(SECRET_URL, 10 * MB, { materialId: "mat00000001" });
  assert.equal(d.net.calls.length, 1);
  assert.ok(a.ok && !a.fromCache);
  assert.ok(b.ok && b.fromCache && c.ok && c.fromCache);
  const s = getStorageStats();
  assert.deepEqual([s.misses, s.hits, s.bytesDownloaded], [1, 2, 1000]);
});

test("five concurrent calls for the same file share one download", async () => {
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  const d = downloader(async () => {
    await gate;
    return pdfResponse();
  });
  const pending = Array.from({ length: 5 }, () => d.fetchPdf(SECRET_URL, 10 * MB, { materialId: "mat00000001" }));
  release();
  const results = await Promise.all(pending);
  assert.equal(d.net.calls.length, 1);
  assert.ok(results.every((r) => r.ok));
  assert.equal(getStorageStats().coalesced, 4);
});

test("a different file is fetched, and the cache is not reused for it", async () => {
  const d = downloader(() => pdfResponse());
  await d.fetchPdf(SECRET_URL, 10 * MB);
  await d.fetchPdf(SECRET_URL + "?other", 10 * MB);
  assert.equal(d.net.calls.length, 2);
});

test("the cache expires after its lifetime, then one fresh download", async () => {
  const d = downloader(() => pdfResponse());
  await d.fetchPdf(SECRET_URL, 10 * MB);
  d.clk.advance(11 * 60 * 1000);
  await d.fetchPdf(SECRET_URL, 10 * MB);
  assert.equal(d.net.calls.length, 2);
});

test("a cache hit still honours the caller's size limit", async () => {
  const d = downloader(() => pdfResponse(5000));
  await d.fetchPdf(SECRET_URL, 10 * MB);
  assert.deepEqual(await d.fetchPdf(SECRET_URL, 1000), { ok: false, reason: "too_big" });
  assert.equal(d.net.calls.length, 1);
});

test("an oversize file is refused from its headers and its body is cancelled, never read", async () => {
  let cancelled = false;
  const d = downloader(() => {
    const body = new ReadableStream<Uint8Array>({
      cancel() {
        cancelled = true;
      },
    });
    return new Response(body, { status: 200, headers: { "content-length": String(900 * MB) } });
  });
  assert.deepEqual(await d.fetchPdf(SECRET_URL, 10 * MB, { materialId: "mat00000001" }), { ok: false, reason: "too_big" });
  assert.ok(cancelled);
  assert.equal(getStorageStats().bytesDownloaded, 0);
});

test("a network error is reported, is not cached, and the next call tries again", async () => {
  let n = 0;
  const d = downloader(() => {
    n++;
    if (n === 1) throw new Error("socket hang up");
    return pdfResponse();
  });
  assert.deepEqual(await d.fetchPdf(SECRET_URL, 10 * MB), { ok: false, reason: "download" });
  const second = await d.fetchPdf(SECRET_URL, 10 * MB);
  assert.ok(second.ok && !second.fromCache);
  assert.equal(d.net.calls.length, 2);
});

test("ordinary HTTP errors (404, a 403 without the blocked text) are download failures and do NOT open the breaker", async () => {
  for (const res of [() => new Response("nope", { status: 404 }), () => new Response("forbidden for another reason", { status: 403 })]) {
    const d = downloader(res);
    assert.deepEqual(await d.fetchPdf(SECRET_URL, 10 * MB), { ok: false, reason: "download" });
    assert.equal(isStorageBreakerOpen(d.clk.now()), false);
  }
});

// ---------- 2. a blocked store stops everything, with no retry loop ----------

test("403 'Your store is blocked' stops: one request, then NO further network use, for any file", async () => {
  const d = downloader(() => blockedResponse());
  assert.deepEqual(await d.fetchPdf(SECRET_URL, 10 * MB, { materialId: "mat00000001" }), { ok: false, reason: "blocked" });
  for (let i = 0; i < 25; i++) {
    assert.deepEqual(await d.fetchPdf(SECRET_URL, 10 * MB), { ok: false, reason: "blocked" });
    assert.deepEqual(await d.fetchPdf(SECRET_URL + "/other.pdf", 10 * MB), { ok: false, reason: "blocked" });
  }
  assert.equal(d.net.calls.length, 1, "the blocked store was asked exactly once");
});

test("the breaker closes by itself after its window, so recovery needs no redeploy", async () => {
  let blocked = true;
  const d = downloader(() => (blocked ? blockedResponse() : pdfResponse()));
  await d.fetchPdf(SECRET_URL, 10 * MB);
  d.clk.advance(BREAKER_MS - 1000);
  assert.deepEqual(await d.fetchPdf(SECRET_URL, 10 * MB), { ok: false, reason: "blocked" });
  assert.equal(d.net.calls.length, 1);
  blocked = false;
  d.clk.advance(2000);
  assert.ok((await d.fetchPdf(SECRET_URL, 10 * MB)).ok);
  assert.equal(d.net.calls.length, 2);
});

test("an SDK 'store suspended' error opens the breaker; later storage calls never run", async () => {
  let calls = 0;
  const suspended = Object.assign(new Error("Vercel Blob: This store has been suspended."), { name: "BlobStoreSuspendedError" });
  assert.ok(isBlockedBlobError(suspended));
  await assert.rejects(() => guardStorage(async () => (calls++, Promise.reject(suspended))), StorageBlockedError);
  for (let i = 0; i < 10; i++) await assert.rejects(() => guardStorage(async () => (calls++, "ok")), StorageBlockedError);
  assert.equal(calls, 1, "the call was made once; the other ten were refused before running");
});

test("an unrelated storage error passes through untouched and does not open the breaker", async () => {
  await assert.rejects(() => guardStorage(async () => Promise.reject(new Error("socket reset"))), /socket reset/);
  assert.equal(isStorageBreakerOpen(), false);
  assert.equal(await guardStorage(async () => "fine"), "fine");
});

test("the stop messages are recognised so the admin loops end instead of retrying", () => {
  assert.ok(isStorageStopMessage(STORAGE_BLOCKED_MESSAGE));
  assert.ok(isStorageStopMessage(DOWNLOAD_BUDGET_MESSAGE));
  assert.equal(isStorageStopMessage("The AI reader is busy right now."), false);
  assert.equal(isStorageStopMessage(null), false);
});

// ---------- 3. the download budget holds across instances ----------

test("after the hourly allowance, further downloads of that book are refused with NO network request", async () => {
  const ledger = createMemoryLedger();
  const clk = clock();
  const make = () => downloader(() => pdfResponse(1000), { ledger, clk }); // a fresh downloader = a fresh instance with an empty memory cache
  for (let i = 0; i < 3; i++) assert.ok((await make().fetchPdf(SECRET_URL, 10 * MB, { materialId: "matAAAAAAA1", expectedBytes: 1000 })).ok);
  assert.equal(ledger.entries().length, 3);
  const refused = make();
  const r = await refused.fetchPdf(SECRET_URL, 10 * MB, { materialId: "matAAAAAAA1", expectedBytes: 1000 });
  assert.ok(!r.ok && r.reason === "budget" && (r.retryAfterMs ?? 0) > 0);
  assert.equal(refused.net.calls.length, 0);
  assert.equal(ledger.entries().length, 3, "a refused download records nothing");
});

test("the budget is per book, the hourly window passes, and cache hits cost nothing", async () => {
  const ledger = createMemoryLedger();
  const clk = clock();
  for (let i = 0; i < 3; i++) await downloader(() => pdfResponse(), { ledger, clk }).fetchPdf(SECRET_URL, 10 * MB, { materialId: "matAAAAAAA1", expectedBytes: 1000 });
  assert.ok((await downloader(() => pdfResponse(), { ledger, clk }).fetchPdf(SECRET_URL + "2", 10 * MB, { materialId: "matBBBBBBB2", expectedBytes: 1000 })).ok);
  clk.advance(61 * 60 * 1000);
  assert.ok((await downloader(() => pdfResponse(), { ledger, clk }).fetchPdf(SECRET_URL, 10 * MB, { materialId: "matAAAAAAA1", expectedBytes: 1000 })).ok);
  const warm = downloader(() => pdfResponse(), { ledger: createMemoryLedger() });
  for (let i = 0; i < 20; i++) assert.ok((await warm.fetchPdf(SECRET_URL, 10 * MB, { materialId: "matAAAAAAA1" })).ok);
  assert.equal(warm.ledger instanceof Object && (warm.ledger as ReturnType<typeof createMemoryLedger>).entries().length, 1);
});

// ---------- 4. telemetry is safe ----------

test("telemetry records outcomes and bytes but never the URL, a token or a long secret", async () => {
  const d = downloader(() => pdfResponse());
  await d.fetchPdf(SECRET_URL + "?token=vercel_blob_rw_SECRETSECRETSECRETSECRET", 10 * MB, { materialId: "mat00000001" });
  await d.fetchPdf(SECRET_URL + "?token=vercel_blob_rw_SECRETSECRETSECRETSECRET", 10 * MB, { materialId: "mat00000001" });
  const all = d.events.join("\n");
  assert.ok(all.includes('"miss"') && all.includes('"hit"'));
  for (const forbidden of ["blob.vercel-storage", "abc123", "AbCdEfGh", "SECRETSECRET", "token", "https://"]) assert.ok(!all.includes(forbidden), `must not log: ${forbidden}`);
});

test("free-text reasons are scrubbed of URLs and long tokens", () => {
  assert.equal(safeReason(`failed https://x.public.blob.vercel-storage.com/a.pdf?token=abc`), "failed [url]");
  assert.ok(!safeReason("key vercel_blob_rw_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA end")?.includes("AAAAAAAAAA"));
  let line = "";
  recordDownloadEvent({ outcome: "error", materialId: "not a safe id with spaces", reason: "http 500" }, (l) => (line = l));
  assert.ok(!line.includes("not a safe id") && line.includes("http 500"));
});

// ---------- 5. OCR store basics ----------

test("savedPages needs one listing and downloads nothing; a finished run is read ONCE and then comes from memory", async () => {
  const f = fakeOcrStorage([win(1, 2), win(3, 4), win(5, 6)]);
  const store = createOcrStore({ storage: f.storage, fetchFn: f.net.fetchFn });
  assert.deepEqual([...(await store.savedPages("m1"))].sort(), [1, 2, 3, 4, 5, 6].map(Number).sort());
  assert.equal(f.net.calls.length, 0);
  const first = await store.readOcrState("m1");
  const lists = f.lists.length;
  const fetches = f.net.calls.length;
  for (let i = 0; i < 12; i++) assert.deepEqual(await store.readOcrState("m1"), first);
  assert.equal(first.kind, "complete");
  assert.equal(f.lists.length, lists);
  assert.equal(f.net.calls.length, fetches);
});

test("book identity from OCR costs one listing and ONE small file, not the PDF", async () => {
  const f = fakeOcrStorage([win(1, 2, 6, HEX_A), win(3, 4, 6, HEX_A)]);
  const store = createOcrStore({ storage: f.storage, fetchFn: f.net.fetchFn });
  assert.deepEqual(await store.readOcrIdentity("m1"), { sourceSha256: HEX_A, totalPages: 6 });
  assert.equal(f.lists.length, 1);
  assert.equal(f.net.calls.length, 1);
});

// ---------- 6. OCR pass: saved progress first, download only when needed ----------

test("OCR already complete (status total known, every saved window verified): finishes with NO download and no rendering", async () => {
  const h = passHarness({ saved: [1, 2, 3, 4, 5, 6], knownTotalPages: 6 });
  const r = await runOcrPass(h.deps);
  assert.ok(r.ok && r.data.complete && r.data.pagesDone === 6);
  assert.equal(h.log.pdf, 0);
  assert.equal(h.log.opened, 0);
});

test("partial progress is preserved: only the missing windows are read, saved ones are not repeated", async () => {
  const h = passHarness({ saved: [1, 2, 3, 4], knownTotalPages: 6 });
  const r = await runOcrPass(h.deps);
  assert.ok(r.ok && r.data.complete);
  assert.deepEqual(h.log.reads, [5]);
  assert.deepEqual(h.log.saves, [5]);
  assert.equal(h.log.pdf, 1);
});

test("blocked storage, or an exhausted budget, at download time stops the pass: nothing rendered, read or recorded; saved pages untouched", async () => {
  for (const [reason, message] of [["blocked", STORAGE_BLOCKED_MESSAGE], ["budget", DOWNLOAD_BUDGET_MESSAGE]] as const) {
    const h = passHarness({ saved: [1, 2], pdf: { ok: false, reason } satisfies PdfFetch });
    assert.deepEqual(await runOcrPass(h.deps), { ok: false, error: message });
    assert.equal(h.log.opened, 0);
    assert.deepEqual(h.log.statuses, []);
    assert.deepEqual([...h.saved].sort(), [1, 2]);
  }
});

test("storage blocks MID-run: earlier windows stay saved, status reflects them, no further batch starts", async () => {
  let saves = 0;
  const h = passHarness({
    total: 12,
    parallelWindows: 1,
    saveWindow: async (w) => {
      saves++;
      if (saves === 2) throw new Blocked();
      h.saved.add(w.startPage);
      h.saved.add(w.endPage);
      h.log.saves.push(w.startPage);
    },
  });
  assert.deepEqual(await runOcrPass(h.deps), { ok: false, error: STORAGE_BLOCKED_MESSAGE });
  assert.deepEqual(h.log.saves, [1]);
  assert.equal(saves, 2, "no third save after the block");
  assert.deepEqual(h.log.statuses.at(-1), [2, 12]);
});

test("a readable-text book is refused BEFORE any page is read, and that check is skipped once OCR has begun", async () => {
  const fresh = passHarness({ textLayerUsable: async () => true });
  const r = await runOcrPass(fresh.deps);
  assert.ok(!r.ok && /already has readable text/.test(r.error));
  assert.deepEqual(fresh.log.reads, []);
  let checks = 0;
  await runOcrPass(passHarness({ saved: [1, 2], textLayerUsable: async () => (checks++, true) }).deps);
  assert.equal(checks, 0);
});

test("when every window fails on quota the pass returns the quotaExhausted RESULT (so the admin screen stops at once), saves nothing, keeps progress", async () => {
  let reads = 0;
  const h = passHarness({ saved: [1, 2], total: 12, parallelWindows: 1, readWindow: async () => (reads++, Promise.reject(new Error("quota"))), isQuotaFailure: () => true });
  const r = await runOcrPass(h.deps);
  assert.ok(r.ok, "quota is a result, not an error: an error makes the screen retry");
  assert.deepEqual([r.data.quotaExhausted, r.data.complete, r.data.pagesDone, r.data.totalPages], [true, false, 2, 12]);
  assert.deepEqual([...h.saved].sort(), [1, 2]);
  assert.deepEqual(h.log.statuses.at(-1), [2, 12], "the saved progress is still recorded truthfully");
  assert.equal(reads, 1, "one window was tried; no further batch starts once the limit is hit");
});

test("a busy / mixed failure (not all quota) with nothing saved is still an ERROR - the screen may retry it once", async () => {
  const h = passHarness({ saved: [1, 2], readWindow: async () => Promise.reject(new Error("busy")), isQuotaFailure: () => false });
  const r = await runOcrPass(h.deps);
  assert.ok(!r.ok && /could not be read this time/.test(r.error));
  assert.deepEqual([...h.saved].sort(), [1, 2]);
});

test("quota hit AFTER some windows were saved: progress is reported normally, not as an exhausted call", async () => {
  let n = 0;
  const h = passHarness({
    total: 12,
    parallelWindows: 1,
    readWindow: async (images) => {
      if (++n === 2) throw new Error("quota");
      return { pages: images.map((i) => `page ${i.page}`), model: "m" };
    },
    isQuotaFailure: () => true,
  });
  const r = await runOcrPass(h.deps);
  assert.ok(r.ok && !r.data.quotaExhausted && !r.data.complete && r.data.pagesDone === 2);
});

// ---------- 7. indexing: where the text comes from ----------

function sourceHarness(over: Partial<IndexSourceDeps> & { state?: Awaited<ReturnType<IndexSourceDeps["loadOcr"]>>; pdf?: PdfFetch; readable?: boolean } = {}) {
  const log = { pdf: 0, ocr: 0, extract: 0 };
  const deps: IndexSourceDeps = {
    material: { id: "mat1", sizeKb: 9000, indexError: null },
    maxDirectBytes: 40 * MB,
    loadOcr: async () => (log.ocr++, over.state ?? { kind: "none" }),
    getPdf: async () => (log.pdf++, over.pdf ?? { ok: true, bytes: new Uint8Array(100), sha256: HEX_A, fromCache: true }),
    extractPages: async () => (log.extract++, ["some readable text"]),
    textIsReadable: () => over.readable ?? true,
    ...over,
  };
  return { deps, log };
}
const OCR_DONE = { kind: "complete" as const, pages: ["a", "b"], totalPages: 2, sourceSha256: "sha-ocr" };

test("a book whose status says its pages were read by OCR uses that text and NEVER fetches its PDF", async () => {
  const h = sourceHarness({ state: OCR_DONE, material: { id: "m", sizeKb: 4500, indexError: formatIndexStatus({ kind: "ocr_ready", total: 2 }) } });
  const r = await resolveIndexSource(h.deps);
  assert.ok(r.ok && r.origin === "ocr" && r.sourceSha === "sha-ocr");
  assert.deepEqual([h.log.pdf, h.log.ocr], [0, 1]);
});

test("a resumed OCR-sourced indexing run (status carries '(from OCR)') also skips the PDF", async () => {
  const status = formatIndexStatus({ kind: "in_progress", done: 90, total: 219, ocr: true });
  const h = sourceHarness({ state: OCR_DONE, material: { id: "m", sizeKb: 4500, indexError: status } });
  assert.ok((await resolveIndexSource(h.deps)).ok);
  assert.equal(h.log.pdf, 0);
});

test("a file too big to read directly (by its recorded size) is never fetched; unread pages give the OCR message", async () => {
  const h = sourceHarness({ material: { id: "m", sizeKb: 55930, indexError: null } });
  const r = await resolveIndexSource(h.deps);
  assert.ok(!r.ok && r.kind === "message" && r.message.startsWith("This PDF is larger than"));
  assert.deepEqual([h.log.pdf, h.log.ocr], [0, 1]);
});

test("an ordinary book costs one (cached) PDF fetch, NO storage listing, and takes the hash the downloader computed", async () => {
  const h = sourceHarness({});
  const r = await resolveIndexSource(h.deps);
  assert.ok(r.ok && r.origin === "pdf" && r.sourceSha === HEX_A);
  assert.deepEqual([h.log.pdf, h.log.ocr], [1, 0]);
});

test("an unreadable (legacy-font) PDF falls back to OCR text if there is some, else refuses", async () => {
  const withOcr = sourceHarness({ readable: false, state: OCR_DONE });
  const a = await resolveIndexSource(withOcr.deps);
  assert.ok(a.ok && a.origin === "ocr");
  assert.deepEqual([withOcr.log.pdf, withOcr.log.ocr], [1, 1]);
  const b = await resolveIndexSource(sourceHarness({ readable: false }).deps);
  assert.ok(!b.ok && b.message.startsWith("This PDF's text uses an old font encoding"));
});

test("blocked storage (downloader or OCR listing), a used-up allowance or an unavailable one end indexing as a STOP - saved status not rewritten", async () => {
  assert.deepEqual(await resolveIndexSource(sourceHarness({ pdf: { ok: false, reason: "blocked" } }).deps), { ok: false, kind: "stop", message: STORAGE_BLOCKED_MESSAGE });
  const viaOcr = await resolveIndexSource({ ...sourceHarness({}).deps, material: { id: "m", sizeKb: 99999, indexError: null }, loadOcr: async () => Promise.reject(new Blocked()) });
  assert.deepEqual(viaOcr, { ok: false, kind: "stop", message: STORAGE_BLOCKED_MESSAGE });
  assert.deepEqual(await resolveIndexSource(sourceHarness({ pdf: { ok: false, reason: "budget" } }).deps), { ok: false, kind: "stop", message: DOWNLOAD_BUDGET_MESSAGE });
  const unavailable = await resolveIndexSource(sourceHarness({ pdf: { ok: false, reason: "budget_unavailable" } }).deps);
  assert.ok(!unavailable.ok && unavailable.kind === "stop");
});

test("an ordinary download failure is a normal message (written to the material as before)", async () => {
  const r = await resolveIndexSource(sourceHarness({ pdf: { ok: false, reason: "download" } }).deps);
  assert.ok(!r.ok && r.kind === "message" && r.message === "The stored file could not be downloaded.");
});

test("a complete book is recognised from the database alone; Re-index and partial books are not", () => {
  const done = formatIndexStatus({ kind: "complete", total: 934 });
  assert.deepEqual(isAlreadyComplete({ indexError: done, indexedAt: new Date(), rebuild: false, savedPassages: 934 }), { total: 934 });
  assert.equal(isAlreadyComplete({ indexError: done, indexedAt: new Date(), rebuild: true, savedPassages: 934 }), null);
  assert.equal(isAlreadyComplete({ indexError: done, indexedAt: new Date(), rebuild: false, savedPassages: 900 }), null);
  assert.equal(isAlreadyComplete({ indexError: done, indexedAt: null, rebuild: false, savedPassages: 934 }), null);
  assert.equal(isAlreadyComplete({ indexError: formatIndexStatus({ kind: "in_progress", done: 5, total: 9 }), indexedAt: new Date(), rebuild: false, savedPassages: 9 }), null);
});

// ---------- 8. chapter linking reuses the cache, handles misses and errors ----------

test("two chapter-link calls on one book make ONE download (the cache is reused) and use the downloader's hash", async () => {
  const d = downloader(() => pdfResponse());
  const deps = () => ({
    material: { id: "mat00000001", sizeKb: 9000 },
    maxDirectBytes: 40 * MB,
    readOcrIdentity: async () => null,
    getPdf: () => d.fetchPdf(SECRET_URL, 100 * MB, { materialId: "mat00000001" }),
  });
  const a = await resolveSourceSha(deps());
  const b = await resolveSourceSha(deps());
  assert.ok(a.ok && b.ok && a.sha === b.sha && a.sha.length === 64);
  assert.equal(d.net.calls.length, 1);
});

test("a very large book is identified from its OCR window, never by downloading the PDF", async () => {
  let pdf = 0;
  const r = await resolveSourceSha({
    material: { id: "m", sizeKb: 55930 },
    maxDirectBytes: 40 * MB,
    readOcrIdentity: async () => ({ sourceSha256: "sha-tel" }),
    getPdf: async () => (pdf++, { ok: true, bytes: new Uint8Array(1), sha256: HEX_A, fromCache: false }),
  });
  assert.deepEqual(r, { ok: true, sha: "sha-tel" });
  assert.equal(pdf, 0);
  const unread = await resolveSourceSha({ material: { id: "m", sizeKb: 55930 }, maxDirectBytes: 40 * MB, readOcrIdentity: async () => null, getPdf: async () => ({ ok: false, reason: "download" }) });
  assert.ok(!unread.ok && /not been read yet/.test(unread.message));
});

test("chapter linking: download failure, blocked store and budget each give a clear message and never throw", async () => {
  const base = { material: { id: "m", sizeKb: 9000 }, maxDirectBytes: 40 * MB, readOcrIdentity: async () => null };
  assert.deepEqual(await resolveSourceSha({ ...base, getPdf: async () => ({ ok: false, reason: "download" }) }), { ok: false, message: "The stored file could not be downloaded." });
  assert.deepEqual(await resolveSourceSha({ ...base, getPdf: async () => ({ ok: false, reason: "blocked" }) }), { ok: false, message: STORAGE_BLOCKED_MESSAGE });
  assert.deepEqual(await resolveSourceSha({ ...base, getPdf: async () => ({ ok: false, reason: "budget" }) }), { ok: false, message: DOWNLOAD_BUDGET_MESSAGE });
  assert.deepEqual(await resolveSourceSha({ ...base, getPdf: async () => Promise.reject(new Blocked()) }), { ok: false, message: STORAGE_BLOCKED_MESSAGE });
});

// ---------- 9. status strings stay compatible ----------

test("indexing status strings: the '(from OCR)' marker round-trips and old strings still parse", () => {
  assert.deepEqual(parseIndexStatus("Indexing in progress: 120 / 1933 passages."), { kind: "in_progress", done: 120, total: 1933 });
  assert.deepEqual(parseIndexStatus("Indexing in progress: 90 / 219 passages (from OCR)."), { kind: "in_progress", done: 90, total: 219, ocr: true });
  assert.equal(formatIndexStatus({ kind: "in_progress", done: 1, total: 2 }), "Indexing in progress: 1 / 2 passages.");
  assert.equal(parseIndexStatus("Complete: 648 / 648 passages.")?.kind, "complete");
  assert.ok(BUDGET.perMaterialPerHour > 0);
});
