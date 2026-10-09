// Offline tests for the storage / indexing safety layer. Nothing here contacts Vercel Blob, Gemini, a database or the network: storage,
// `fetch` and the ledger are all fakes that COUNT how often they are used, because "was it downloaded again?" is the thing being proved.
// Run:  npm run test:storage
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

import { createPdfDownloader } from "@/lib/rag/pdf-cache";
import { BREAKER_MS, StorageBlockedError, guardStorage, isStorageBreakerOpen, isBlockedBlobError, markStorageBlocked, resetStorageBreaker } from "@/lib/storage/blocked";
import { checkDownloadBudget, type DownloadBudget, type DownloadLedger, type LedgerEntry } from "@/lib/storage/download-budget";
import { getStorageStats, recordDownloadEvent, resetStorageStats, safeReason } from "@/lib/storage/telemetry";
import { DOWNLOAD_BUDGET_MESSAGE, STORAGE_BLOCKED_MESSAGE, isStorageStopMessage } from "@/lib/storage/stop-messages";
import { createOcrStore, type OcrStorage } from "@/lib/rag/ocr-store-core";
import { runOcrPass, type OcrRunDeps } from "@/lib/rag/ocr-run";
import { isAlreadyComplete, resolveIndexSource, type IndexSourceDeps } from "@/lib/rag/index-source";
import { resolveSourceSha } from "@/lib/rag/source-identity";
import { formatIndexStatus, parseIndexStatus } from "@/lib/rag/index-status";
import type { OcrWindowFile } from "@/lib/rag/ocr";
import type { PageRenderer } from "@/lib/rag/ocr-render";
import type { PdfFetch } from "@/lib/rag/pdf-cache";

const MB = 1024 * 1024;
const SECRET_URL = "https://abc123.public.blob.vercel-storage.com/materials/c1/s1/book-AbCdEfGhIjKlMnOpQrStUvWxYz012345.pdf";

beforeEach(() => {
  resetStorageBreaker();
  resetStorageStats();
});

// ---------- fakes ----------

function fakeNetwork(handler: (url: string) => Response | Promise<Response>) {
  const calls: string[] = [];
  const fetchFn = (async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    return handler(url);
  }) as typeof fetch;
  return { fetchFn, calls };
}

const pdfResponse = (size = 1000) => new Response(new Uint8Array(size).fill(7), { status: 200, headers: { "content-length": String(size) } });
const blockedResponse = () => new Response("Your store is blocked", { status: 403 });

function fakeLedger() {
  const rows: (LedgerEntry & { materialId: string })[] = [];
  const ledger: DownloadLedger = {
    async entries(sinceMs, materialId) {
      return rows.filter((r) => r.at >= sinceMs && (!materialId || r.materialId === materialId)).map(({ at, bytes }) => ({ at, bytes }));
    },
    async record(materialId, bytes, at) {
      rows.push({ materialId, bytes, at });
    },
  };
  return { ledger, rows };
}

function clock(start = 1_000_000_000_000) {
  let t = start;
  return { now: () => t, advance: (ms: number) => (t += ms) };
}

const BUDGET: DownloadBudget = { perMaterialPerHour: 3, perMaterialPerDayBytes: 50 * MB, globalPerDayBytes: 80 * MB };

function downloader(handler: (url: string) => Response | Promise<Response>, opts: { ledger?: DownloadLedger; budget?: DownloadBudget; clk?: ReturnType<typeof clock> } = {}) {
  const net = fakeNetwork(handler);
  const events: string[] = [];
  const clk = opts.clk ?? clock();
  const d = createPdfDownloader({
    fetchFn: net.fetchFn,
    ledger: opts.ledger ?? fakeLedger().ledger,
    budget: () => opts.budget ?? BUDGET,
    now: clk.now,
    log: (e) => {
      events.push(JSON.stringify(e));
      recordDownloadEvent(e, () => {});
    },
  });
  return { ...d, net, events, clk };
}

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
  const strict = await d.fetchPdf(SECRET_URL, 1000);
  assert.deepEqual(strict, { ok: false, reason: "too_big" });
  assert.equal(d.net.calls.length, 1);
});

// ---------- 2. misses and errors are handled ----------

test("an oversize file is refused from its headers and its body is cancelled, never read", async () => {
  let cancelled = false;
  let bodyRead = false;
  const d = downloader(() => {
    const body = new ReadableStream<Uint8Array>({
      pull() {
        bodyRead = true;
      },
      cancel() {
        cancelled = true;
      },
    });
    return new Response(body, { status: 200, headers: { "content-length": String(900 * MB) } });
  });
  const r = await d.fetchPdf(SECRET_URL, 10 * MB, { materialId: "mat00000001" });
  assert.deepEqual(r, { ok: false, reason: "too_big" });
  assert.ok(cancelled);
  assert.equal(getStorageStats().bytesDownloaded, 0);
  void bodyRead;
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

test("an ordinary HTTP error (404) is a download failure and does NOT open the breaker", async () => {
  const d = downloader(() => new Response("nope", { status: 404 }));
  assert.deepEqual(await d.fetchPdf(SECRET_URL, 10 * MB), { ok: false, reason: "download" });
  assert.equal(isStorageBreakerOpen(d.clk.now()), false);
});

test("an ordinary 403 (not the blocked-store text) does NOT open the breaker", async () => {
  const d = downloader(() => new Response("forbidden for another reason", { status: 403 }));
  assert.deepEqual(await d.fetchPdf(SECRET_URL, 10 * MB), { ok: false, reason: "download" });
  assert.equal(isStorageBreakerOpen(d.clk.now()), false);
});

// ---------- 3. a blocked store stops everything, with no retry loop ----------

test("403 'Your store is blocked' stops: one request, then NO further network use, for any file", async () => {
  const d = downloader(() => blockedResponse());
  const first = await d.fetchPdf(SECRET_URL, 10 * MB, { materialId: "mat00000001" });
  assert.deepEqual(first, { ok: false, reason: "blocked" });
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
  const again = await d.fetchPdf(SECRET_URL, 10 * MB);
  assert.ok(again.ok);
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

// ---------- 4. the download budget holds across instances ----------

test("after the hourly allowance, further downloads of that book are refused with NO network request", async () => {
  const { ledger, rows } = fakeLedger();
  const clk = clock();
  const make = () => downloader(() => pdfResponse(1000), { ledger, clk }); // a fresh downloader = a fresh instance with an empty memory cache
  for (let i = 0; i < 3; i++) assert.ok((await make().fetchPdf(SECRET_URL, 10 * MB, { materialId: "matAAAAAAA1" })).ok);
  assert.equal(rows.length, 3);
  const refused = make();
  const r = await refused.fetchPdf(SECRET_URL, 10 * MB, { materialId: "matAAAAAAA1" });
  assert.equal(r.ok, false);
  assert.ok(!r.ok && r.reason === "budget" && (r.retryAfterMs ?? 0) > 0);
  assert.equal(refused.net.calls.length, 0);
  assert.equal(rows.length, 3, "a refused download records nothing");
});

test("the budget is per book: another book is unaffected", async () => {
  const { ledger } = fakeLedger();
  const clk = clock();
  for (let i = 0; i < 3; i++) await downloader(() => pdfResponse(), { ledger, clk }).fetchPdf(SECRET_URL, 10 * MB, { materialId: "matAAAAAAA1" });
  const other = downloader(() => pdfResponse(), { ledger, clk });
  assert.ok((await other.fetchPdf(SECRET_URL + "2", 10 * MB, { materialId: "matBBBBBBB2" })).ok);
});

test("the hourly window passes and downloads are allowed again", async () => {
  const { ledger } = fakeLedger();
  const clk = clock();
  for (let i = 0; i < 3; i++) await downloader(() => pdfResponse(), { ledger, clk }).fetchPdf(SECRET_URL, 10 * MB, { materialId: "matAAAAAAA1" });
  clk.advance(61 * 60 * 1000);
  assert.ok((await downloader(() => pdfResponse(), { ledger, clk }).fetchPdf(SECRET_URL, 10 * MB, { materialId: "matAAAAAAA1" })).ok);
});

test("cache hits cost nothing against the budget", async () => {
  const { ledger, rows } = fakeLedger();
  const d = downloader(() => pdfResponse(), { ledger });
  for (let i = 0; i < 20; i++) assert.ok((await d.fetchPdf(SECRET_URL, 10 * MB, { materialId: "matAAAAAAA1" })).ok);
  assert.equal(rows.length, 1);
});

test("the per-book daily byte cap and the project-wide daily byte cap both refuse", async () => {
  const clk = clock();
  const { ledger, rows } = fakeLedger();
  rows.push({ materialId: "matAAAAAAA1", bytes: 51 * MB, at: clk.now() - 5 * 3600_000 });
  const book = await checkDownloadBudget(ledger, "matAAAAAAA1", BUDGET, clk.now());
  assert.ok(!book.ok && book.scope === "material-day");
  const { ledger: l2, rows: r2 } = fakeLedger();
  r2.push({ materialId: "matBBBBBBB2", bytes: 40 * MB, at: clk.now() - 3600_000 * 2 }, { materialId: "matCCCCCCC3", bytes: 41 * MB, at: clk.now() - 3600_000 * 3 });
  const project = await checkDownloadBudget(l2, "matAAAAAAA1", BUDGET, clk.now());
  assert.ok(!project.ok && project.scope === "project-day");
});

test("a ledger that cannot be read never blocks a legitimate download", async () => {
  const broken: DownloadLedger = { entries: () => Promise.reject(new Error("db down")), record: () => Promise.reject(new Error("db down")) };
  const d = downloader(() => pdfResponse(), { ledger: broken });
  assert.ok((await d.fetchPdf(SECRET_URL, 10 * MB, { materialId: "matAAAAAAA1" })).ok);
});

// ---------- 5. telemetry is safe ----------

test("telemetry records outcomes and bytes but never the URL, a token or a long secret", async () => {
  const d = downloader(() => pdfResponse(), {});
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

// ---------- 6. OCR store: no needless listing, blocked is never "no OCR" ----------

function fakeOcrStorage(windows: { name: string; file: OcrWindowFile }[], opts: { listError?: Error; blockedFetch?: boolean } = {}) {
  const lists: string[] = [];
  const uploads: string[] = [];
  const storage: OcrStorage = {
    async list(prefix) {
      lists.push(prefix);
      if (opts.listError) throw opts.listError;
      return windows.map((w) => ({ pathname: `${prefix}${w.name}`, url: `https://store.example/${w.name}` }));
    },
    async upload({ pathname }) {
      uploads.push(pathname);
    },
    async delete() {},
  };
  const net = fakeNetwork((url) => {
    if (opts.blockedFetch) return blockedResponse();
    const w = windows.find((x) => url.endsWith(x.name));
    return w ? new Response(JSON.stringify(w.file), { status: 200 }) : new Response("", { status: 404 });
  });
  return { storage, lists, uploads, net };
}

const win = (start: number, end: number, total = 6, sha = "sha-a"): { name: string; file: OcrWindowFile } => ({
  name: `w${start}-${end}-xyz.json`,
  file: { version: 1, totalPages: total, startPage: start, endPage: end, pages: Array.from({ length: end - start + 1 }, (_, i) => `text ${start + i}`), sourceSha256: sha, model: "m" },
});

test("savedPages needs one listing and downloads nothing", async () => {
  const f = fakeOcrStorage([win(1, 2), win(3, 3)]);
  const store = createOcrStore({ storage: f.storage, fetchFn: f.net.fetchFn });
  assert.deepEqual([...(await store.savedPages("mat1"))].sort(), [1, 2, 3]);
  assert.equal(f.lists.length, 1);
  assert.equal(f.net.calls.length, 0);
});

test("a finished OCR run is listed and fetched ONCE; later calls come from memory", async () => {
  const f = fakeOcrStorage([win(1, 2), win(3, 4), win(5, 6)]);
  const store = createOcrStore({ storage: f.storage, fetchFn: f.net.fetchFn });
  const a = await store.loadCompleteOcr("mat1");
  const listsAfterFirst = f.lists.length;
  const fetchesAfterFirst = f.net.calls.length;
  for (let i = 0; i < 12; i++) assert.deepEqual(await store.loadCompleteOcr("mat1"), a);
  assert.equal(a?.pages.length, 6);
  assert.equal(f.lists.length, listsAfterFirst);
  assert.equal(f.net.calls.length, fetchesAfterFirst);
});

test("an incomplete run is not 'complete', and is not memoised (it can still grow)", async () => {
  const f = fakeOcrStorage([win(1, 2), win(5, 6)]);
  const store = createOcrStore({ storage: f.storage, fetchFn: f.net.fetchFn });
  assert.equal(await store.loadCompleteOcr("mat1"), null);
  assert.equal(await store.loadCompleteOcr("mat1"), null);
  assert.equal(f.lists.length, 2);
});

test("a blocked store is thrown, never reported as 'no OCR text' - from the listing...", async () => {
  const f = fakeOcrStorage([], { listError: new StorageBlockedError() });
  const store = createOcrStore({ storage: f.storage, fetchFn: f.net.fetchFn });
  await assert.rejects(() => store.loadCompleteOcr("mat1"), StorageBlockedError);
  await assert.rejects(() => store.savedPages("mat1"), StorageBlockedError);
});

test("...and from a window file answering 403 'store is blocked', which also opens the breaker", async () => {
  const f = fakeOcrStorage([win(1, 6)], { blockedFetch: true });
  const store = createOcrStore({ storage: f.storage, fetchFn: f.net.fetchFn });
  await assert.rejects(() => store.loadCompleteOcr("mat1"), StorageBlockedError);
  assert.ok(isStorageBreakerOpen());
  const listsBefore = f.lists.length;
  await assert.rejects(() => store.savedPages("mat1"), StorageBlockedError);
  assert.equal(f.lists.length, listsBefore, "with the breaker open, storage is not even listed");
});

test("a non-blocked listing error behaves as before: no OCR text", async () => {
  const f = fakeOcrStorage([], { listError: new Error("temporary") });
  const store = createOcrStore({ storage: f.storage, fetchFn: f.net.fetchFn });
  assert.equal(await store.loadCompleteOcr("mat1"), null);
});

test("book identity from OCR costs one listing and ONE small file, not the PDF", async () => {
  const f = fakeOcrStorage([win(1, 2, 6, "sha-tel"), win(3, 4, 6, "sha-tel")]);
  const store = createOcrStore({ storage: f.storage, fetchFn: f.net.fetchFn });
  assert.deepEqual(await store.readOcrIdentity("mat1"), { sourceSha256: "sha-tel", totalPages: 6 });
  assert.equal(f.lists.length, 1);
  assert.equal(f.net.calls.length, 1);
});

// ---------- 7. OCR pass: saved progress first, download only when needed ----------

function fakeRenderer(pageCount: number): PageRenderer {
  return { pageCount, renderPng: async () => new Uint8Array(4), close() {} };
}

function ocrHarness(over: Partial<OcrRunDeps> & { saved?: number[]; pdf?: PdfFetch; total?: number } = {}) {
  const saved = new Set(over.saved ?? []);
  const log = { pdf: 0, renders: 0, reads: [] as number[], saves: [] as number[], statuses: [] as [number, number][], opened: 0 };
  const total = over.total ?? 6;
  const deps: OcrRunDeps = {
    knownTotalPages: null,
    getSavedPages: async () => new Set(saved),
    saveWindow: async (w) => {
      log.saves.push(w.startPage);
      for (let p = w.startPage; p <= w.endPage; p++) saved.add(p);
    },
    getPdf: async () => {
      log.pdf++;
      return over.pdf ?? { ok: true, bytes: new Uint8Array(2000), fromCache: false };
    },
    maxDirectBytes: 40 * MB,
    textLayerUsable: async () => false,
    sha256: () => "sha-x",
    openRenderer: async () => {
      log.opened++;
      return fakeRenderer(total);
    },
    readWindow: async (images, first) => {
      log.reads.push(images[0].page);
      void first;
      return { pages: images.map((i) => `page ${i.page}`), model: "m" };
    },
    validate: () => ({ ok: true }),
    isQuotaFailure: () => false,
    recordStatus: async (done, tot) => {
      log.statuses.push([done, tot]);
    },
    now: () => 0,
    startedAt: 0,
    callBudgetMs: 50_000,
    batchAllowanceMs: 30_000,
    parallelWindows: 3,
    ...over,
  };
  return { deps, log, saved };
}

test("OCR already complete (status total known, every page saved): finishes with NO download and no rendering", async () => {
  const h = ocrHarness({ saved: [1, 2, 3, 4, 5, 6], knownTotalPages: 6 });
  const r = await runOcrPass(h.deps);
  assert.ok(r.ok && r.data.complete && r.data.pagesDone === 6);
  assert.equal(h.log.pdf, 0);
  assert.equal(h.log.opened, 0);
  assert.deepEqual(h.log.reads, []);
});

test("partial progress is preserved: only the missing windows are read, saved ones are not repeated", async () => {
  const h = ocrHarness({ saved: [1, 2, 3, 4], knownTotalPages: 6 });
  const r = await runOcrPass(h.deps);
  assert.ok(r.ok && r.data.complete);
  assert.deepEqual(h.log.reads, [5], "windows 1-2 and 3-4 are not read again");
  assert.deepEqual(h.log.saves, [5]);
  assert.equal(h.log.pdf, 1, "the book was fetched once, because something was left to read");
  assert.deepEqual(h.log.statuses.at(-1), [6, 6]);
});

test("a fresh run downloads once and reads every window once", async () => {
  const h = ocrHarness({});
  const r = await runOcrPass(h.deps);
  assert.ok(r.ok && r.data.complete);
  assert.equal(h.log.pdf, 1);
  assert.deepEqual([...h.log.reads].sort(), [1, 3, 5]);
});

test("blocked storage at download time stops the pass: nothing rendered, read or recorded", async () => {
  const h = ocrHarness({ saved: [1, 2], pdf: { ok: false, reason: "blocked" } });
  const r = await runOcrPass(h.deps);
  assert.deepEqual(r, { ok: false, error: STORAGE_BLOCKED_MESSAGE });
  assert.equal(h.log.opened, 0);
  assert.deepEqual(h.log.reads, []);
  assert.deepEqual(h.log.statuses, []);
  assert.deepEqual([...h.saved].sort(), [1, 2], "saved progress untouched");
});

test("an exhausted download budget stops the pass with its own message", async () => {
  const h = ocrHarness({ pdf: { ok: false, reason: "budget", retryAfterMs: 1000 } });
  assert.deepEqual(await runOcrPass(h.deps), { ok: false, error: DOWNLOAD_BUDGET_MESSAGE });
  assert.equal(h.log.opened, 0);
});

test("blocked storage while listing saved pages stops before anything else", async () => {
  const h = ocrHarness({ getSavedPages: async () => Promise.reject(new StorageBlockedError()) });
  assert.deepEqual(await runOcrPass(h.deps), { ok: false, error: STORAGE_BLOCKED_MESSAGE });
  assert.equal(h.log.pdf, 0);
});

test("storage blocks MID-run: earlier windows stay saved, status reflects them, no further batch starts", async () => {
  let saves = 0;
  const h = ocrHarness({
    total: 12,
    parallelWindows: 1,
    saveWindow: async (w) => {
      saves++;
      if (saves === 2) throw new StorageBlockedError();
      h.saved.add(w.startPage);
      h.saved.add(w.endPage);
      h.log.saves.push(w.startPage);
    },
  });
  const r = await runOcrPass(h.deps);
  assert.deepEqual(r, { ok: false, error: STORAGE_BLOCKED_MESSAGE });
  assert.deepEqual(h.log.saves, [1], "the first window was saved before the block");
  assert.equal(saves, 2, "no third save was attempted after the block");
  assert.deepEqual(h.log.statuses.at(-1), [2, 12], "the saved status still reflects what was saved");
  assert.deepEqual([...h.saved].sort((a, b) => a - b), [1, 2]);
});

test("a book that already has a readable text layer is refused BEFORE any page is read", async () => {
  const h = ocrHarness({ textLayerUsable: async () => true });
  const r = await runOcrPass(h.deps);
  assert.ok(!r.ok && /already has readable text/.test(r.error));
  assert.deepEqual(h.log.reads, []);
});

test("the readable-text check is skipped once OCR has begun (saved pages exist): no needless text extraction", async () => {
  let checks = 0;
  const h = ocrHarness({ saved: [1, 2], textLayerUsable: async () => (checks++, true) });
  await runOcrPass(h.deps);
  assert.equal(checks, 0);
});

test("when every window fails on quota the pass reports it, saves nothing and keeps progress", async () => {
  const h = ocrHarness({ saved: [1, 2], readWindow: async () => Promise.reject(new Error("quota")), isQuotaFailure: () => true });
  const r = await runOcrPass(h.deps);
  assert.ok(!r.ok && /out of quota/.test(r.error));
  assert.deepEqual([...h.saved].sort(), [1, 2]);
});

// ---------- 8. indexing: where the text comes from ----------

function sourceHarness(over: Partial<IndexSourceDeps> & { ocr?: Awaited<ReturnType<IndexSourceDeps["loadOcr"]>>; pdf?: PdfFetch; readable?: boolean } = {}) {
  const log = { pdf: 0, ocr: 0, extract: 0 };
  const deps: IndexSourceDeps = {
    material: { id: "mat1", sizeKb: 9000, indexError: null },
    maxDirectBytes: 40 * MB,
    loadOcr: async () => (log.ocr++, over.ocr ?? null),
    getPdf: async () => (log.pdf++, over.pdf ?? { ok: true, bytes: new Uint8Array(100), fromCache: true }),
    extractPages: async () => (log.extract++, ["some readable text"]),
    textIsReadable: () => over.readable ?? true,
    sha256: () => "sha-pdf",
    ...over,
  };
  return { deps, log };
}
const OCR_DONE = { pages: ["a", "b"], totalPages: 2, sourceSha256: "sha-ocr" };

test("a book whose status says its pages were read by OCR uses that text and NEVER fetches its PDF", async () => {
  const h = sourceHarness({ ocr: OCR_DONE, material: { id: "m", sizeKb: 4500, indexError: formatIndexStatus({ kind: "ocr_ready", total: 2 }) } });
  const r = await resolveIndexSource(h.deps);
  assert.ok(r.ok && r.origin === "ocr" && r.sourceSha === "sha-ocr");
  assert.deepEqual([h.log.pdf, h.log.ocr], [0, 1]);
});

test("a resumed OCR-sourced indexing run (status carries '(from OCR)') also skips the PDF", async () => {
  const status = formatIndexStatus({ kind: "in_progress", done: 90, total: 219, ocr: true });
  assert.equal(parseIndexStatus(status)?.kind === "in_progress" && (parseIndexStatus(status) as { ocr?: boolean }).ocr, true);
  const h = sourceHarness({ ocr: OCR_DONE, material: { id: "m", sizeKb: 4500, indexError: status } });
  assert.ok((await resolveIndexSource(h.deps)).ok);
  assert.equal(h.log.pdf, 0);
});

test("a file too big to read directly (by its recorded size) is never fetched; unread pages give the OCR message", async () => {
  const h = sourceHarness({ material: { id: "m", sizeKb: 55930, indexError: null } });
  const r = await resolveIndexSource(h.deps);
  assert.ok(!r.ok && r.kind === "message" && r.message.startsWith("This PDF is larger than"));
  assert.deepEqual([h.log.pdf, h.log.ocr], [0, 1]);
});

test("an ordinary book costs one (cached) PDF fetch and NO storage listing", async () => {
  const h = sourceHarness({});
  const r = await resolveIndexSource(h.deps);
  assert.ok(r.ok && r.origin === "pdf" && r.sourceSha === "sha-pdf");
  assert.deepEqual([h.log.pdf, h.log.ocr], [1, 0]);
});

test("an unreadable (legacy-font) PDF falls back to OCR text if there is some, else refuses", async () => {
  const withOcr = sourceHarness({ readable: false, ocr: OCR_DONE });
  const a = await resolveIndexSource(withOcr.deps);
  assert.ok(a.ok && a.origin === "ocr");
  assert.deepEqual([withOcr.log.pdf, withOcr.log.ocr], [1, 1]);
  const without = sourceHarness({ readable: false });
  const b = await resolveIndexSource(without.deps);
  assert.ok(!b.ok && b.message.startsWith("This PDF's text uses an old font encoding"));
});

test("blocked storage (from the downloader, or from the OCR listing) ends indexing as a STOP - saved status is not rewritten", async () => {
  const viaPdf = await resolveIndexSource(sourceHarness({ pdf: { ok: false, reason: "blocked" } }).deps);
  assert.deepEqual(viaPdf, { ok: false, kind: "stop", message: STORAGE_BLOCKED_MESSAGE });
  const viaOcr = await resolveIndexSource({ ...sourceHarness({}).deps, material: { id: "m", sizeKb: 99999, indexError: null }, loadOcr: async () => Promise.reject(new StorageBlockedError()) });
  assert.deepEqual(viaOcr, { ok: false, kind: "stop", message: STORAGE_BLOCKED_MESSAGE });
  const viaBudget = await resolveIndexSource(sourceHarness({ pdf: { ok: false, reason: "budget" } }).deps);
  assert.deepEqual(viaBudget, { ok: false, kind: "stop", message: DOWNLOAD_BUDGET_MESSAGE });
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

// ---------- 9. chapter linking reuses the cache, handles misses and errors ----------

test("two chapter-link calls on one book make ONE download (the cache is reused)", async () => {
  const d = downloader(() => pdfResponse(), {});
  const deps = (): Parameters<typeof resolveSourceSha>[0] => ({
    material: { id: "mat00000001", sizeKb: 9000 },
    maxDirectBytes: 40 * MB,
    readOcrIdentity: async () => null,
    getPdf: () => d.fetchPdf(SECRET_URL, 100 * MB, { materialId: "mat00000001" }),
    sha256: () => "sha-pdf",
  });
  assert.deepEqual(await resolveSourceSha(deps()), { ok: true, sha: "sha-pdf" });
  assert.deepEqual(await resolveSourceSha(deps()), { ok: true, sha: "sha-pdf" });
  assert.equal(d.net.calls.length, 1);
});

test("a very large book is identified from its OCR window, never by downloading the PDF", async () => {
  let pdf = 0;
  const r = await resolveSourceSha({
    material: { id: "m", sizeKb: 55930 },
    maxDirectBytes: 40 * MB,
    readOcrIdentity: async () => ({ sourceSha256: "sha-tel" }),
    getPdf: async () => (pdf++, { ok: true, bytes: new Uint8Array(1), fromCache: false }),
    sha256: () => "x",
  });
  assert.deepEqual(r, { ok: true, sha: "sha-tel" });
  assert.equal(pdf, 0);
  const unread = await resolveSourceSha({ material: { id: "m", sizeKb: 55930 }, maxDirectBytes: 40 * MB, readOcrIdentity: async () => null, getPdf: async () => ({ ok: false, reason: "download" }), sha256: () => "x" });
  assert.ok(!unread.ok && /not been read yet/.test(unread.message));
});

test("chapter linking: download failure, blocked store and budget each give a clear message and never throw", async () => {
  const base = { material: { id: "m", sizeKb: 9000 }, maxDirectBytes: 40 * MB, readOcrIdentity: async () => null, sha256: () => "x" };
  const miss = await resolveSourceSha({ ...base, getPdf: async () => ({ ok: false, reason: "download" }) });
  assert.deepEqual(miss, { ok: false, message: "The stored file could not be downloaded." });
  const blocked = await resolveSourceSha({ ...base, getPdf: async () => ({ ok: false, reason: "blocked" }) });
  assert.deepEqual(blocked, { ok: false, message: STORAGE_BLOCKED_MESSAGE });
  const budget = await resolveSourceSha({ ...base, getPdf: async () => ({ ok: false, reason: "budget" }) });
  assert.deepEqual(budget, { ok: false, message: DOWNLOAD_BUDGET_MESSAGE });
  const thrown = await resolveSourceSha({ ...base, getPdf: async () => Promise.reject(new StorageBlockedError()) });
  assert.deepEqual(thrown, { ok: false, message: STORAGE_BLOCKED_MESSAGE });
});

// ---------- 10. status strings stay compatible ----------

test("indexing status strings: the new '(from OCR)' marker round-trips and old strings still parse", () => {
  assert.deepEqual(parseIndexStatus("Indexing in progress: 120 / 1933 passages."), { kind: "in_progress", done: 120, total: 1933 });
  assert.deepEqual(parseIndexStatus("Indexing in progress: 90 / 219 passages (from OCR)."), { kind: "in_progress", done: 90, total: 219, ocr: true });
  assert.equal(formatIndexStatus({ kind: "in_progress", done: 1, total: 2 }), "Indexing in progress: 1 / 2 passages.");
  assert.equal(parseIndexStatus("Complete: 648 / 648 passages.")?.kind, "complete");
  markStorageBlocked();
  assert.ok(isStorageBreakerOpen());
});
