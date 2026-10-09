// Tests for the download budget (concurrency, fail-closed, reservation release, realistic workflow) and for consistent blocked-store handling.
// Offline: fake ledger, fake database, fake network.
// Run:  npm run test:storage
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

import { createAuditLogLedger, createMemoryLedger, decideBudget, defaultBudget, type DownloadLedger, type LedgerDb, type LedgerTx } from "@/lib/storage/download-budget";
import { createPdfDownloader } from "@/lib/rag/pdf-cache";
import { StorageBlockedError, isStorageBreakerOpen, resetStorageBreaker } from "@/lib/storage/blocked";
import { isStorageBlocked, storageFailureMessage, uploadOrBlocked } from "@/lib/storage/errors";
import { DOWNLOAD_BUDGET_UNAVAILABLE_MESSAGE, STORAGE_BLOCKED_MESSAGE, isStorageStopMessage } from "@/lib/storage/stop-messages";
import { recordDownloadEvent, resetStorageStats } from "@/lib/storage/telemetry";
import { BUDGET, MB, SECRET_URL, blockedResponse, clock, downloader, fakeNetwork, pdfResponse } from "./helpers";

beforeEach(() => {
  resetStorageBreaker();
  resetStorageStats();
});

const HOUR = 3600_000;

/** A fresh server instance (empty memory cache) that shares the given ledger and clock with the others. */
function instance(ledger: DownloadLedger, clk: ReturnType<typeof clock>, handler: (u: string) => Response | Promise<Response>, budget = BUDGET) {
  const net = fakeNetwork(handler);
  const d = createPdfDownloader({ fetchFn: net.fetchFn, ledger, budget: () => budget, now: clk.now, log: (e) => recordDownloadEvent(e, () => {}) });
  return { ...d, net };
}

// ---------- concurrency ----------

test("twelve instances ask at the same instant: exactly the allowed number download, the rest are refused with NO network use", async () => {
  const ledger = createMemoryLedger();
  const clk = clock();
  const instances = Array.from({ length: 12 }, () => instance(ledger, clk, () => pdfResponse(1000)));
  const results = await Promise.all(instances.map((i) => i.fetchPdf(SECRET_URL, 10 * MB, { materialId: "matAAAAAAA1", expectedBytes: 1000 })));
  assert.equal(results.filter((r) => r.ok).length, BUDGET.perMaterialPerHour);
  assert.equal(results.filter((r) => !r.ok && r.reason === "budget").length, 12 - BUDGET.perMaterialPerHour);
  assert.equal(instances.reduce((n, i) => n + i.net.calls.length, 0), BUDGET.perMaterialPerHour, "refused callers never touched the network");
  assert.equal(ledger.entries().length, BUDGET.perMaterialPerHour);
});

test("a download is RESERVED before it starts, so a slow download already counts against concurrent callers", async () => {
  const ledger = createMemoryLedger();
  const clk = clock();
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  const slow = instance(ledger, clk, async () => (await gate, pdfResponse(1000)), { ...BUDGET, perMaterialPerHour: 1 });
  const inFlight = slow.fetchPdf(SECRET_URL, 10 * MB, { materialId: "matAAAAAAA1", expectedBytes: 1000 });
  await new Promise((r) => setTimeout(r, 0));
  const other = instance(ledger, clk, () => pdfResponse(1000), { ...BUDGET, perMaterialPerHour: 1 });
  const refused = await other.fetchPdf(SECRET_URL, 10 * MB, { materialId: "matAAAAAAA1", expectedBytes: 1000 });
  assert.ok(!refused.ok && refused.reason === "budget");
  assert.equal(other.net.calls.length, 0);
  release();
  assert.ok((await inFlight).ok);
});

// ---------- reservations: counted when uncertain, released when nothing moved ----------

test("a reservation counts the book's expected size immediately; a successful download keeps it", async () => {
  const ledger = createMemoryLedger();
  const i = instance(ledger, clock(), () => pdfResponse(1000));
  await i.fetchPdf(SECRET_URL, 100 * MB, { materialId: "matAAAAAAA1", expectedBytes: 57 * MB });
  assert.deepEqual(ledger.entries().map((e) => e.bytes), [57 * MB]);
});

test("nothing transferred -> the reservation is given back: a blocked store, an HTTP error and a refusal from the headers", async () => {
  for (const [label, handler] of [
    ["blocked", () => blockedResponse()],
    ["404", () => new Response("no", { status: 404 })],
    ["too big (headers)", () => new Response(new Uint8Array(10), { status: 200, headers: { "content-length": String(900 * MB) } })],
  ] as const) {
    const ledger = createMemoryLedger();
    const i = instance(ledger, clock(), handler);
    const r = await i.fetchPdf(SECRET_URL, 10 * MB, { materialId: "matAAAAAAA1", expectedBytes: 5 * MB });
    assert.equal(r.ok, false, label);
    assert.equal(ledger.entries().length, 0, `${label}: released`);
    resetStorageBreaker();
  }
});

test("an uncertain outcome (a network error mid-way) stays counted, so a failing loop exhausts the budget instead of running forever", async () => {
  const ledger = createMemoryLedger();
  const clk = clock();
  const make = () => instance(ledger, clk, () => Promise.reject(new Error("socket hang up")));
  for (let n = 0; n < BUDGET.perMaterialPerHour; n++) assert.deepEqual(await make().fetchPdf(SECRET_URL, 10 * MB, { materialId: "matAAAAAAA1", expectedBytes: 1000 }), { ok: false, reason: "download" });
  const stopped = make();
  const r = await stopped.fetchPdf(SECRET_URL, 10 * MB, { materialId: "matAAAAAAA1", expectedBytes: 1000 });
  assert.ok(!r.ok && r.reason === "budget");
  assert.equal(stopped.net.calls.length, 0);
});

test("a release that fails does not break the call - the allowance is simply counted conservatively", async () => {
  const base = createMemoryLedger();
  const flaky: DownloadLedger = { reserve: (...a) => base.reserve(...a), release: () => Promise.reject(new Error("db blip")) };
  const i = instance(flaky, clock(), () => blockedResponse());
  assert.deepEqual(await i.fetchPdf(SECRET_URL, 10 * MB, { materialId: "matAAAAAAA1", expectedBytes: 1000 }), { ok: false, reason: "blocked" });
});

// ---------- fail closed ----------

test("if the allowance cannot be checked or recorded, NOTHING is downloaded and the answer is a stop", async () => {
  const broken: DownloadLedger = { reserve: () => Promise.reject(new Error("db down")), release: async () => {} };
  const i = instance(broken, clock(), () => pdfResponse(1000));
  const r = await i.fetchPdf(SECRET_URL, 10 * MB, { materialId: "matAAAAAAA1", expectedBytes: 1000 });
  assert.deepEqual(r, { ok: false, reason: "budget_unavailable" });
  assert.equal(i.net.calls.length, 0, "no download without a recorded allowance");
  assert.ok(isStorageStopMessage(DOWNLOAD_BUDGET_UNAVAILABLE_MESSAGE), "the admin loops end on it instead of retrying");
});

// ---------- the budget fits a realistic resumable textbook workflow ----------

test("DEFAULT budget, a 57 MB book on a warm server: a whole 31-pass page-reading run costs ONE download", async () => {
  const ledger = createMemoryLedger();
  const i = instance(ledger, clock(), () => pdfResponse(1000), defaultBudget());
  for (let pass = 0; pass < 31; pass++) assert.ok((await i.fetchPdf(SECRET_URL, 100 * MB, { materialId: "matTELUGU001", expectedBytes: 57 * MB })).ok);
  assert.equal(i.net.calls.length, 1);
  assert.equal(ledger.entries().length, 1);
});

test("DEFAULT budget, worst case (every pass on a cold instance): the book can still be worked through over a day, and a runaway is stopped", async () => {
  const ledger = createMemoryLedger();
  const clk = clock();
  const b = defaultBudget();
  const attempt = () => instance(ledger, clk, () => pdfResponse(1000), b).fetchPdf(SECRET_URL, 100 * MB, { materialId: "matTELUGU001", expectedBytes: 57 * MB });
  // an hour of cold passes: the hourly cap lets a useful number through, then stops
  let allowed = 0;
  for (let n = 0; n < 40; n++) if ((await attempt()).ok) allowed++;
  assert.equal(allowed, b.perMaterialPerHour);
  assert.ok(allowed >= 10, "enough passes per hour to make real progress (6 pages each)");
  // later hours: the day's byte cap is what ends it - about 17 full downloads of 57 MB
  let day = allowed;
  for (let hour = 1; hour < 6; hour++) {
    clk.advance(HOUR + 1000);
    for (let n = 0; n < 40; n++) if ((await attempt()).ok) day++;
  }
  assert.ok(day * 57 * MB <= b.perMaterialPerDayBytes + 57 * MB, "never much more than the per-book daily cap");
  assert.ok(day >= 17 && day <= 19, `about a gigabyte of that book per day (${day} downloads)`);
});

test("DEFAULT budget leaves a small book (Hindi, 4.6 MB) unconstrained for a normal run, and the whole project capped per day", async () => {
  const b = defaultBudget();
  assert.ok(b.perMaterialPerHour >= 10);
  assert.ok(b.globalPerDayBytes <= 3 * 1024 * MB, "a bad day cannot use more than about a quarter of Hobby's 10 GB month");
  const ledger = createMemoryLedger();
  const clk = clock();
  for (let n = 0; n < b.perMaterialPerHour; n++) assert.ok((await instance(ledger, clk, () => pdfResponse(1000), b).fetchPdf(SECRET_URL, 10 * MB, { materialId: "matHINDI0001", expectedBytes: 4.6 * MB })).ok);
});

test("decideBudget: each scope refuses with a positive retry time, and an empty history allows", () => {
  const now = 10 * 24 * HOUR;
  assert.deepEqual(decideBudget([], "m", BUDGET, now), { ok: true });
  const hourFull = Array.from({ length: 3 }, (_, i) => ({ materialId: "m", at: now - (i + 1) * 60_000, bytes: 1 }));
  const h = decideBudget(hourFull, "m", BUDGET, now);
  assert.ok(!h.ok && h.scope === "material-hour" && h.retryAfterMs > 0);
  const dayBytes = decideBudget([{ materialId: "m", at: now - 5 * HOUR, bytes: 51 * MB }], "m", BUDGET, now);
  assert.ok(!dayBytes.ok && dayBytes.scope === "material-day" && dayBytes.retryAfterMs > 0);
  const project = decideBudget([{ materialId: "other", at: now - HOUR * 2, bytes: 81 * MB }], "m", BUDGET, now);
  assert.ok(!project.ok && project.scope === "project-day");
});

// ---------- the production ledger's transaction logic (database stood in for) ----------

function fakeDb() {
  type Row = { id: string; message: string; createdAt: Date; resource: string | null };
  const rows: Row[] = [];
  const calls: string[] = [];
  let queue: Promise<unknown> = Promise.resolve();
  let seq = 0;
  let failNext = false;
  const db: LedgerDb = {
    // transactions run one at a time, like a global advisory lock would force
    $transaction<T>(fn: (tx: LedgerTx) => Promise<T>): Promise<T> {
      const run = queue.then(async () => {
        if (failNext) {
          failNext = false;
          throw new Error("database unavailable");
        }
        const tx: LedgerTx = {
          async $executeRaw(strings) {
            calls.push(`lock:${strings.join("")}`);
          },
          auditLog: {
            async findMany(args) {
              calls.push("findMany");
              const where = (args as { where: { createdAt: { gte: Date } } }).where;
              return rows.filter((r) => r.createdAt >= where.createdAt.gte && r.message.startsWith("[pdf-download]"));
            },
            async create(args) {
              const d = (args as { data: { resource: string; message: string } }).data;
              calls.push(`create:${d.message}`);
              const row = { id: `row${++seq}`, message: d.message, createdAt: new Date(clockNow()), resource: d.resource };
              rows.push(row);
              return { id: row.id };
            },
          },
        };
        return fn(tx);
      });
      queue = run.catch(() => {});
      return run;
    },
    auditLog: {
      async deleteMany(args) {
        const id = (args as { where: { id: string } }).where.id;
        const at = rows.findIndex((r) => r.id === id);
        if (at >= 0) rows.splice(at, 1);
        calls.push(`delete:${id}`);
      },
    },
  };
  let nowMs = 1_000_000_000_000;
  const clockNow = () => nowMs;
  return { db, rows, calls, failNext: () => (failNext = true), setNow: (n: number) => (nowMs = n), now: () => nowMs };
}

test("production ledger: the allowance check and the reservation happen inside ONE locked transaction, lock first", async () => {
  const f = fakeDb();
  const ledger = createAuditLogLedger(async () => f.db);
  const r = await ledger.reserve("matAAAAAAA1", 5 * MB, BUDGET, f.now());
  assert.ok(r.ok && r.id);
  assert.ok(f.calls[0].startsWith("lock:SELECT pg_advisory_xact_lock"), "the lock is taken before anything is read");
  assert.deepEqual(f.calls.slice(1, 3), ["findMany", `create:[pdf-download] bytes=${5 * MB}`]);
  assert.equal(f.rows[0].resource, "StudyMaterial:matAAAAAAA1");
});

test("production ledger: ten concurrent reservations -> exactly the allowed number succeed (no double-spend of the last slot)", async () => {
  const f = fakeDb();
  const ledger = createAuditLogLedger(async () => f.db);
  const results = await Promise.all(Array.from({ length: 10 }, () => ledger.reserve("matAAAAAAA1", MB, BUDGET, f.now())));
  assert.equal(results.filter((r) => r.ok).length, BUDGET.perMaterialPerHour);
  assert.equal(f.rows.length, BUDGET.perMaterialPerHour);
});

test("production ledger: refused reservations write nothing; old rows age out; release deletes by id", async () => {
  const f = fakeDb();
  const ledger = createAuditLogLedger(async () => f.db);
  const ids: string[] = [];
  for (let n = 0; n < BUDGET.perMaterialPerHour; n++) {
    const r = await ledger.reserve("matAAAAAAA1", MB, BUDGET, f.now());
    if (r.ok && r.id) ids.push(r.id);
  }
  const before = f.rows.length;
  assert.equal((await ledger.reserve("matAAAAAAA1", MB, BUDGET, f.now())).ok, false);
  assert.equal(f.rows.length, before, "a refusal records nothing");
  assert.ok((await ledger.reserve("matBBBBBBB2", MB, BUDGET, f.now())).ok, "another book is unaffected");
  await ledger.release(ids[0]);
  assert.equal(f.rows.some((r) => r.id === ids[0]), false);
  f.setNow(f.now() + 25 * HOUR);
  assert.ok((await ledger.reserve("matAAAAAAA1", MB, BUDGET, f.now())).ok, "after a day the old rows no longer count");
});

test("production ledger: a database failure is thrown (so the downloader fails CLOSED), never swallowed into 'allowed'", async () => {
  const f = fakeDb();
  const ledger = createAuditLogLedger(async () => f.db);
  f.failNext();
  await assert.rejects(() => ledger.reserve("matAAAAAAA1", MB, BUDGET, f.now()), /database unavailable/);
  const i = instance({ reserve: () => ledger.reserve("x", 1, BUDGET, f.now()).then(() => Promise.reject(new Error("db"))), release: async () => {} }, clock(), () => pdfResponse());
  assert.deepEqual(await i.fetchPdf(SECRET_URL, MB, { materialId: "matAAAAAAA1" }), { ok: false, reason: "budget_unavailable" });
});

// ---------- upload / import / intake: one consistent blocked-store answer ----------

test("a blocked store is recognised however it is reported, and gets the plain message instead of a retry invitation", () => {
  const sdk = Object.assign(new Error("Vercel Blob: This store has been suspended."), { name: "BlobStoreSuspendedError" });
  for (const e of [new StorageBlockedError(), sdk, new Error("Your store is blocked")]) {
    assert.equal(isStorageBlocked(e), true);
    assert.equal(storageFailureMessage(e, "Could not store the downloaded file."), STORAGE_BLOCKED_MESSAGE);
  }
  assert.equal(isStorageBlocked(new Error("socket hang up")), false);
  assert.equal(storageFailureMessage(new Error("socket hang up"), "Could not store the downloaded file."), "Could not store the downloaded file.");
  assert.equal(storageFailureMessage(undefined, "fallback"), "fallback");
});

test("uploadOrBlocked: success passes through; a blocked store is reported (no throw); any other error is re-thrown as before", async () => {
  assert.deepEqual(await uploadOrBlocked(async () => "stored"), { ok: true, value: "stored" });
  assert.deepEqual(await uploadOrBlocked(async () => Promise.reject(new StorageBlockedError())), { ok: false, blocked: true });
  const suspended = Object.assign(new Error("suspended"), { name: "BlobStoreSuspendedError" });
  assert.deepEqual(await uploadOrBlocked(async () => Promise.reject(suspended)), { ok: false, blocked: true });
  await assert.rejects(() => uploadOrBlocked(async () => Promise.reject(new Error("disk full"))), /disk full/);
});

test("once the breaker is open, upload attempts through the guarded provider path are refused without a network call", async () => {
  const { guardStorage } = await import("@/lib/storage/blocked");
  let calls = 0;
  const suspended = Object.assign(new Error("suspended"), { name: "BlobStoreSuspendedError" });
  assert.deepEqual(await uploadOrBlocked(() => guardStorage(async () => (calls++, Promise.reject(suspended)))), { ok: false, blocked: true });
  assert.ok(isStorageBreakerOpen());
  for (let n = 0; n < 5; n++) assert.deepEqual(await uploadOrBlocked(() => guardStorage(async () => (calls++, "never"))), { ok: false, blocked: true });
  assert.equal(calls, 1);
});
