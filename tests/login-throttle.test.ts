// Offline tests for sign-in brute-force protection: the limiter (lib/auth/login-throttle.ts) and the login route that uses it (app/api/auth/login/route.ts). The "database" is an in-memory
// audit log shared by every "instance" in the test - which is the point: the count does not live in one process's memory. Operations on it can be given delays so that simultaneous
// requests genuinely interleave (a count sees only the rows that existed when it STARTED, like a database statement). The password check is a scripted stand-in.
// No real database, network or password is involved. Needs Node's module mocking (--experimental-test-module-mocks, as in `npm run test:storage`).
import { test, mock, before, after, afterEach } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import { reserveLoginAttempt, clientAddress, isPlausibleAddress, LOGIN_LIMITS, LOGIN_WINDOW_MS, type ThrottleDb, type LoginAttempt } from "@/lib/auth/login-throttle";

const here = (p: string) => new URL(`../${p}`, import.meta.url).href;

// ---- the shared audit log ----------------------------------------------------------------------------------------------------------------------------------------------
type Row = { id: string; userId: string | null; action: string; resource: string; message: string; createdAt: Date };
const log = { rows: [] as Row[], now: new Date("2026-10-18T10:00:00Z"), seq: 0, failCount: 0, failCreate: false, failDelete: false, delay: (_op: string) => 0 };
type Where = { action?: string; createdAt?: { gt: Date }; resource?: string | { startsWith?: string; endsWith?: string } };
const matchesWhere = (r: Row, w: Where) => {
  if (w.action && r.action !== w.action) return false;
  if (w.createdAt && !(r.createdAt > w.createdAt.gt)) return false;
  if (typeof w.resource === "string") return r.resource === w.resource;
  if (w.resource?.startsWith) return r.resource.startsWith(w.resource.startsWith);
  if (w.resource?.endsWith) return r.resource.endsWith(w.resource.endsWith);
  return true;
};
const sleep = (ms: number) => (ms > 0 ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve());
const auditLog = {
  // The count is taken the moment the statement STARTS, then the answer travels back (after the delay).
  count: async ({ where }: { where: Where }) => {
    if (log.failCount > 0) {
      log.failCount--;
      throw new Error("database unavailable");
    }
    const n = log.rows.filter((r) => matchesWhere(r, where)).length;
    await sleep(log.delay("count"));
    return n;
  },
  create: async ({ data }: { data: Omit<Row, "id" | "createdAt"> }) => {
    if (log.failCreate) throw new Error("database unavailable");
    const row = { ...data, id: `r${++log.seq}`, createdAt: new Date(log.now) };
    log.rows.push(row); // committed when the statement runs
    await sleep(log.delay("create"));
    return { id: row.id };
  },
  delete: async ({ where }: { where: { id: string } }) => {
    if (log.failDelete) throw new Error("database unavailable");
    await sleep(log.delay("delete"));
    log.rows = log.rows.filter((r) => r.id !== where.id);
  },
};
const db = { auditLog } as unknown as ThrottleDb;
const reset = () => Object.assign(log, { rows: [], now: new Date("2026-10-18T10:00:00Z"), failCount: 0, failCreate: false, failDelete: false, delay: () => 0 });
const at = (username: string, address: string | null): LoginAttempt => ({ username, address });
/** One attempt with a WRONG password: reserve, and keep the reservation (it is the failure record). */
const wrong = async (username: string, address: string | null) => reserveLoginAttempt(db, at(username, address), log.now);
const quietErrors = () => mock.method(console, "error", () => undefined);

// ---- the limit's boundaries -----------------------------------------------------------------------------------------------------------------------------------------------

test("the fifth attempt for one username from one address is let through; the sixth is refused, and a refused attempt leaves nothing behind", async () => {
  reset();
  for (let i = 1; i <= LOGIN_LIMITS.perAddressAndUsername; i++) assert.equal((await wrong("asha", "1.2.3.4")).allowed, true, `attempt ${i}`);
  const rowsBefore = log.rows.length;
  assert.equal((await wrong("asha", "1.2.3.4")).allowed, false, "attempt 6");
  assert.equal(log.rows.length, rowsBefore, "the refused attempt wrote nothing (net)");
  for (let i = 0; i < 20; i++) await wrong("asha", "1.2.3.4");
  assert.equal(log.rows.length, rowsBefore, "keeping on at it never grows the table");
});

test("a SUCCESSFUL sign-in releases its place: any number of correct sign-ins never use up the budget", async () => {
  reset();
  for (let i = 0; i < 30; i++) {
    const r = await wrong("asha", "1.2.3.4");
    assert.equal(r.allowed, true, `sign-in ${i}`);
    if (r.allowed) await r.release();
  }
  assert.equal(log.rows.length, 0, "no row is left for a success");
  // and a few earlier wrong guesses still count alongside them
  for (let i = 0; i < 4; i++) await wrong("asha", "1.2.3.4");
  const ok = await wrong("asha", "1.2.3.4");
  assert.equal(ok.allowed, true, "the 5th");
  if (ok.allowed) await ok.release();
  assert.equal((await wrong("asha", "1.2.3.4")).allowed, true, "a released success did not count: still the 5th wrong guess");
  assert.equal((await wrong("asha", "1.2.3.4")).allowed, false);
});

test("the username is matched without regard to case or surrounding spaces, so changing the spelling does not reset the count", async () => {
  reset();
  await wrong("Asha", "1.2.3.4");
  await wrong("  ASHA ", "1.2.3.4");
  await wrong("asha", "1.2.3.4");
  await wrong("ASHA", "1.2.3.4");
  await wrong(" asha", "1.2.3.4");
  assert.equal((await wrong("asha", "1.2.3.4")).allowed, false);
});

test("guessing one username does not block a different username from the same address, nor the real user of the first from their own address", async () => {
  reset();
  for (let i = 0; i < 5; i++) await wrong("asha", "1.2.3.4");
  assert.equal((await wrong("asha", "1.2.3.4")).allowed, false);
  assert.equal((await wrong("ravi", "1.2.3.4")).allowed, true);
  assert.equal((await wrong("asha", "9.9.9.9")).allowed, true);
});

test("one address trying many usernames is eventually refused for all (a school sharing an address has room: 60)", async () => {
  reset();
  for (let i = 0; i < LOGIN_LIMITS.perAddress; i++) assert.equal((await wrong(`user${i}`, "5.5.5.5")).allowed, true, `user${i}`);
  assert.equal((await wrong("someone-new", "5.5.5.5")).allowed, false);
  assert.equal((await wrong("someone-new", "6.6.6.6")).allowed, true, "another address is unaffected");
});

test("one username tried from many addresses is eventually refused from everywhere (20), and the message to the real user is only a short wait", async () => {
  reset();
  for (let i = 0; i < LOGIN_LIMITS.perUsername; i++) assert.equal((await wrong("victim", `10.0.0.${i}`)).allowed, true, `address ${i}`);
  assert.equal((await wrong("victim", "203.0.113.7")).allowed, false, "even from a brand-new address");
  assert.equal((await wrong("victim2", "203.0.113.7")).allowed, true, "other usernames are untouched");
  // the lock lifts by itself when the failures age out
  log.now = new Date(log.now.getTime() + LOGIN_WINDOW_MS + 1000);
  assert.equal((await wrong("victim", "203.0.113.7")).allowed, true);
});

test("failures older than 15 minutes no longer count, to the second", async () => {
  reset();
  for (let i = 0; i < 5; i++) await wrong("asha", "1.2.3.4");
  const start = log.now;
  log.now = new Date(start.getTime() + LOGIN_WINDOW_MS - 1000);
  assert.equal((await wrong("asha", "1.2.3.4")).allowed, false, "14m59s later: still counted");
  log.now = new Date(start.getTime() + LOGIN_WINDOW_MS + 1);
  assert.equal((await wrong("asha", "1.2.3.4")).allowed, true, "just over 15 minutes later");
});

test("with no usable address only the per-username limit applies - other people without an address are not lumped together", async () => {
  reset();
  for (let i = 0; i < 40; i++) await wrong(`user${i}`, null);
  assert.equal((await wrong("fresh-user", null)).allowed, true);
  for (let i = 0; i < 5; i++) await wrong("asha", null);
  assert.equal((await wrong("asha", null)).allowed, false, "the same username is limited even without an address (a changed header cannot dodge it)");
});

// ---- simultaneous attempts --------------------------------------------------------------------------------------------------------------------------------------------------

/** A small deterministic generator, so the 'random' delays are the same on every run. */
const lcg = (seed: number) => () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);

test("a burst of simultaneous guesses at one username from one address can never get more than the limit through (25 different interleavings, 40 attempts each)", async () => {
  for (let seed = 1; seed <= 25; seed++) {
    reset();
    const rnd = lcg(seed);
    log.delay = () => Math.floor(rnd() * 6);
    const results = await Promise.all(Array.from({ length: 40 }, () => reserveLoginAttempt(db, at("asha", "1.2.3.4"), log.now)));
    const allowed = results.filter((r) => r.allowed).length;
    assert.ok(allowed <= LOGIN_LIMITS.perAddressAndUsername, `seed ${seed}: ${allowed} got through`);
    assert.equal(log.rows.length, allowed, `seed ${seed}: the refused attempts removed their own rows`);
  }
});

test("a distributed burst at one username (a different address each) is held to the per-username limit too", async () => {
  for (let seed = 1; seed <= 10; seed++) {
    reset();
    const rnd = lcg(seed * 7);
    log.delay = () => Math.floor(rnd() * 6);
    const results = await Promise.all(Array.from({ length: 60 }, (_, i) => reserveLoginAttempt(db, at("victim", `10.1.${i}.1`), log.now)));
    const allowed = results.filter((r) => r.allowed).length;
    assert.ok(allowed <= LOGIN_LIMITS.perUsername, `seed ${seed}: ${allowed} got through`);
  }
});

test("simultaneous attempts that all SUCCEED are not blocked by each other once they release - and a burst never lets a refused attempt's reservation linger", async () => {
  reset();
  log.delay = () => 1;
  const results = await Promise.all(Array.from({ length: 4 }, () => reserveLoginAttempt(db, at("asha", "1.2.3.4"), log.now)));
  for (const r of results) if (r.allowed) await r.release();
  assert.equal(log.rows.length, 0);
});

// ---- database trouble --------------------------------------------------------------------------------------------------------------------------------------------------------

test("if the first count cannot be read the attempt is let through (failing closed would lock everyone out when the database hiccups)", async () => {
  reset();
  const quiet = quietErrors();
  try {
    log.failCount = 1;
    const r = await wrong("asha", "1.2.3.4");
    assert.equal(r.allowed, true);
    if (r.allowed) await assert.doesNotReject(() => r.release());
  } finally {
    quiet.mock.restore();
  }
});

test("if the reservation cannot be written the attempt is let through, and releasing does nothing", async () => {
  reset();
  const quiet = quietErrors();
  try {
    log.failCreate = true;
    const r = await wrong("asha", "1.2.3.4");
    assert.equal(r.allowed, true);
    if (r.allowed) await r.release();
    assert.equal(log.rows.length, 0);
  } finally {
    quiet.mock.restore();
  }
});

test("if the recount fails AFTER the reservation was written, the attempt is let through and a success still removes its row", async () => {
  reset();
  const quiet = quietErrors();
  try {
    // 3 counts before reserving succeed, then the recount's first count fails
    const original = auditLog.count;
    let n = 0;
    auditLog.count = async (args: { where: Where }) => {
      if (++n === 4) throw new Error("database unavailable");
      return original(args);
    };
    const r = await wrong("asha", "1.2.3.4");
    auditLog.count = original;
    assert.equal(r.allowed, true);
    assert.equal(log.rows.length, 1, "the reservation is there");
    if (r.allowed) await r.release();
    assert.equal(log.rows.length, 0, "released on success: no phantom failure");
  } finally {
    quiet.mock.restore();
  }
});

test("if a reservation cannot be deleted, nothing throws and the row simply counts as a failure (the conservative direction)", async () => {
  reset();
  const quiet = quietErrors();
  try {
    const r = await wrong("asha", "1.2.3.4");
    log.failDelete = true;
    if (r.allowed) await assert.doesNotReject(() => r.release());
    assert.equal(log.rows.length, 1);
  } finally {
    quiet.mock.restore();
  }
});

// ---- what is stored (privacy) ------------------------------------------------------------------------------------------------------------------------------------------------

const previousSecret = process.env.SESSION_SECRET;
after(() => {
  if (previousSecret === undefined) delete process.env.SESSION_SECRET;
  else process.env.SESSION_SECRET = previousSecret;
});

test("what is stored holds neither the username nor the address - only keyed HMAC values - and no user id", async () => {
  reset();
  process.env.SESSION_SECRET = "a-long-random-secret-for-the-test-0123456789";
  await wrong("my-secret-password-typed-in-the-wrong-box", "198.51.100.23");
  const row = log.rows[0];
  assert.equal(row.action, "LOGIN");
  assert.equal(row.userId, null);
  assert.ok(!/secret|password|198\.51|wrong-box/.test(JSON.stringify(row)), JSON.stringify(row));
  assert.match(row.resource, /^LoginFailure:[0-9a-f]{32}\|[0-9a-f]{32}$/);
});

test("the identifiers are HMACs: NOT the plain hash of the value (so an IPv4 address cannot be recovered by trying them all), stable for one secret, different for another", async () => {
  reset();
  process.env.SESSION_SECRET = "first-long-random-secret-for-the-test-0123456789";
  await wrong("asha", "198.51.100.23");
  const first = log.rows[0].resource;
  const plain = (v: string) => createHash("sha256").update(v).digest("hex").slice(0, 16);
  assert.ok(!first.includes(plain("198.51.100.23")) && !first.includes(plain("asha")), "not an unkeyed hash");
  reset();
  await wrong("asha", "198.51.100.23");
  assert.equal(log.rows[0].resource, first, "the same secret gives the same identifier");
  reset();
  process.env.SESSION_SECRET = "second-long-random-secret-for-the-test-0123456789";
  await wrong("asha", "198.51.100.23");
  assert.notEqual(log.rows[0].resource, first, "a different secret gives a different one (rotating it restarts the counts)");
});

test("an address and a username that look the same do not produce the same identifier (they are keyed separately)", async () => {
  reset();
  process.env.SESSION_SECRET = "a-long-random-secret-for-the-test-0123456789";
  await wrong("1.2.3.4", "1.2.3.4");
  const [addr, user] = log.rows[0].resource.replace("LoginFailure:", "").split("|");
  assert.notEqual(addr, user);
});

// ---- the client's address (spoofing) ------------------------------------------------------------------------------------------------------------------------------------------

const h = (o: Record<string, string>) => ({ get: (k: string) => o[k.toLowerCase()] ?? null });

test("forwarding headers are IGNORED unless this is the Vercel deployment: a client can send any X-Forwarded-For anywhere else", () => {
  const spoofed = h({ "x-forwarded-for": "203.0.113.9", "x-real-ip": "198.51.100.2" });
  assert.equal(clientAddress(spoofed, false), null);
  const before = process.env.VERCEL;
  try {
    delete process.env.VERCEL;
    assert.equal(clientAddress(spoofed), null, "no VERCEL variable: not trusted");
    process.env.VERCEL = "0";
    assert.equal(clientAddress(spoofed), null);
    process.env.VERCEL = "1";
    assert.equal(clientAddress(spoofed), "203.0.113.9", "on Vercel the platform sets the header");
  } finally {
    if (before === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = before;
  }
});

test("when trusted, the first forwarded address is used, then X-Real-IP; anything that is not an address is ignored", () => {
  assert.equal(clientAddress(h({ "x-forwarded-for": "203.0.113.9, 70.41.3.18" }), true), "203.0.113.9");
  assert.equal(clientAddress(h({ "x-real-ip": "198.51.100.2" }), true), "198.51.100.2");
  assert.equal(clientAddress(h({ "x-forwarded-for": "2001:db8::1" }), true), "2001:db8::1", "IPv6");
  assert.equal(clientAddress(h({}), true), null);
  for (const junk of ["unknown", "", "999.1.1.1", "1.2.3", "<script>", "a".repeat(200), "1.2.3.4 ; DROP", "1.2.3.4.5", "::::::::::::::::::::::::::::::::::::::::::::::::"]) {
    assert.equal(clientAddress(h({ "x-forwarded-for": junk }), true), null, JSON.stringify(junk).slice(0, 30));
  }
  assert.equal(clientAddress(h({ "x-forwarded-for": "garbage", "x-real-ip": "198.51.100.2" }), true), "198.51.100.2", "a bad first value falls back to the next header");
  assert.equal(isPlausibleAddress("255.255.255.255"), true);
  assert.equal(isPlausibleAddress("256.0.0.1"), false);
});

// ---- the login route ---------------------------------------------------------------------------------------------------------------------------------------------------

class AuthConfigurationError extends Error {}
const users = {
  calls: 0,
  mode: "normal" as "normal" | "pending" | "config" | "crash",
  accepts: (_u: string, p: string) => p === "correct-horse",
};
mock.module("server-only", { namedExports: {} });
mock.module(here("lib/prisma.ts"), { namedExports: { prisma: { auditLog } } });
mock.module(here("lib/auth/users.ts"), {
  namedExports: {
    AuthConfigurationError,
    findUser: async (_role: string, username: string, password: string) => {
      users.calls++;
      if (users.mode === "config") throw new AuthConfigurationError("DATABASE_URL is not configured");
      if (users.mode === "crash") throw new Error("unexpected failure");
      if (!users.accepts(username, password)) return { kind: "invalid_credentials" };
      if (users.mode === "pending") return { kind: "account_status", status: "PENDING" };
      return { kind: "success", user: { id: "u1", name: "Asha", role: "student", username } };
    },
  },
});
mock.module(here("lib/auth/session.ts"), { namedExports: { SESSION_COOKIE: "maiteacher_session", SESSION_MAX_AGE_SECONDS: 3600, signSession: async () => "signed-token", verifySession: async () => null } });

let POST: (req: import("next/server").NextRequest) => Promise<Response>;
const previousDatabaseUrl = process.env.DATABASE_URL;
const previousVercel = process.env.VERCEL;
before(async () => {
  process.env.DATABASE_URL = "postgresql://not-a-real-database.invalid/none"; // only makes the route use the (mocked) database; nothing connects
  POST = (await import("@/app/api/auth/login/route")).POST;
});
after(() => {
  if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = previousDatabaseUrl;
  if (previousVercel === undefined) delete process.env.VERCEL;
  else process.env.VERCEL = previousVercel;
});
const attemptLogin = async (password: string, over: { username?: string; xff?: string } = {}) => {
  const { NextRequest } = await import("next/server");
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (over.xff) headers["x-forwarded-for"] = over.xff;
  const res = await POST(new NextRequest("https://app.test/api/auth/login", { method: "POST", headers, body: JSON.stringify({ role: "student", username: over.username ?? "asha", password }) }));
  return { status: res.status, body: (await res.json()) as { error?: string }, retryAfter: res.headers.get("retry-after"), cookie: res.headers.get("set-cookie") };
};
// The route asks the REAL clock for its 15-minute window (reserveLoginAttempt's default `now`), while the fake audit log stamps every row with `log.now`. Left alone, these tests only passed
// while the real time happened to be within 15 minutes of that fixed stamp. So each route test pins Date to the log's time (only Date - the interleaving delays still use real timers), and
// afterEach puts the real clock back whether the test passed or failed.
const realClockAtLoad = Date.now();
afterEach(() => mock.timers.reset());
const routeReset = () => {
  reset();
  mock.timers.reset();
  mock.timers.enable({ apis: ["Date"], now: log.now });
  users.calls = 0;
  users.mode = "normal";
  delete process.env.VERCEL;
};

test("route: five wrong passwords are 401; the sixth attempt - even with the CORRECT password - is 429 with Retry-After, and the password is not even checked", async () => {
  routeReset();
  for (let i = 0; i < 5; i++) assert.equal((await attemptLogin(`wrong-${i}`)).status, 401, `attempt ${i + 1}`);
  const callsBefore = users.calls;
  const refused = await attemptLogin("correct-horse");
  assert.equal(refused.status, 429);
  assert.match(refused.body.error ?? "", /Too many sign-in attempts/);
  assert.equal(refused.retryAfter, "900");
  assert.equal(refused.cookie, null, "no session is issued");
  assert.equal(users.calls, callsBefore, "findUser was not called");
  assert.equal(log.rows.length, 5);
});

test("route: correct sign-ins leave no reservation behind and are never limited, however many there are", async () => {
  routeReset();
  for (let i = 0; i < 25; i++) {
    const ok = await attemptLogin("correct-horse");
    assert.equal(ok.status, 200, `sign-in ${i}`);
    assert.match(ok.cookie ?? "", /maiteacher_session=signed-token/);
    assert.match(ok.cookie ?? "", /HttpOnly/i);
  }
  assert.equal(log.rows.length, 0);
});

test("route: the CORRECT password for a pending or suspended account is 403 and leaves NO failed-attempt record - repeated visits never lock it out", async () => {
  routeReset();
  users.mode = "pending";
  for (let i = 0; i < 12; i++) assert.equal((await attemptLogin("correct-horse")).status, 403, `visit ${i}`);
  assert.equal(log.rows.length, 0);
  assert.equal((await attemptLogin("wrong")).status, 401, "a wrong password for it is still an ordinary failure");
  assert.equal(log.rows.length, 1);
});

test("route: an unavailable sign-in service (503) and an unexpected crash do not count as a failed guess", async () => {
  routeReset();
  const quiet = quietErrors();
  try {
    users.mode = "config";
    assert.equal((await attemptLogin("whatever")).status, 503);
    assert.equal(log.rows.length, 0);
    users.mode = "crash";
    await assert.rejects(() => attemptLogin("whatever"), /unexpected failure/);
    assert.equal(log.rows.length, 0, "released even though the request blew up");
  } finally {
    quiet.mock.restore();
  }
});

test("route: simultaneous wrong guesses are held to the limit - at most five are evaluated", async () => {
  routeReset();
  const rnd = lcg(42);
  log.delay = () => Math.floor(rnd() * 5);
  const results = await Promise.all(Array.from({ length: 30 }, (_, i) => attemptLogin(`guess-${i}`)));
  const evaluated = results.filter((r) => r.status === 401).length;
  const refused = results.filter((r) => r.status === 429).length;
  assert.ok(evaluated <= LOGIN_LIMITS.perAddressAndUsername, `${evaluated} guesses were evaluated`);
  assert.equal(evaluated + refused, 30);
  assert.ok(users.calls <= LOGIN_LIMITS.perAddressAndUsername, "findUser (the expensive password check) ran at most five times");
});

test("route: a spoofed X-Forwarded-For does NOT dodge the limit when the headers are not trusted - and counts per client when they are (on Vercel)", async () => {
  routeReset();
  for (let i = 0; i < 5; i++) await attemptLogin("wrong", { xff: `203.0.113.${i + 1}` }); // a different claimed address each time
  assert.equal((await attemptLogin("correct-horse", { xff: "198.51.100.77" })).status, 429, "untrusted: the claimed addresses are ignored, so it is the same client");
  routeReset();
  process.env.VERCEL = "1";
  for (let i = 0; i < 5; i++) await attemptLogin("wrong", { xff: "203.0.113.1" });
  assert.equal((await attemptLogin("correct-horse", { xff: "203.0.113.1" })).status, 429, "on Vercel: same address, refused");
  assert.equal((await attemptLogin("correct-horse", { xff: "198.51.100.77" })).status, 200, "on Vercel: a different real client is not affected");
});

test("route: missing fields are 400 before anything is read or written; a database error in the limiter lets the sign-in through", async () => {
  routeReset();
  const { NextRequest } = await import("next/server");
  const res = await POST(new NextRequest("https://app.test/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ role: "student" }) }));
  assert.equal(res.status, 400);
  assert.equal(log.rows.length, 0);
  const quiet = quietErrors();
  try {
    log.failCount = 1;
    assert.equal((await attemptLogin("correct-horse")).status, 200);
  } finally {
    quiet.mock.restore();
  }
});

test("route: an unknown username is limited exactly like a real one - the 429 reveals nothing about whether the account exists", async () => {
  routeReset();
  for (let i = 0; i < 5; i++) await attemptLogin("wrong", { username: "no-such-user" });
  const ghost = await attemptLogin("wrong", { username: "no-such-user" });
  routeReset();
  for (let i = 0; i < 5; i++) await attemptLogin("wrong");
  const real = await attemptLogin("wrong");
  assert.deepEqual([ghost.status, ghost.body, ghost.retryAfter], [real.status, real.body, real.retryAfter]);
});

test("route: failures recorded by another 'instance' count here, because the count lives in the database", async () => {
  routeReset();
  for (let i = 0; i < 5; i++) await wrong("asha", null);
  assert.equal((await attemptLogin("correct-horse")).status, 429);
});

test("the pinned clock of the route tests is put back afterwards: Date is the real clock again, and nothing stays mocked", () => {
  assert.ok(Math.abs(Date.now() - realClockAtLoad) < 5 * 60_000, "Date.now() is still pinned to the fake log's time");
  assert.ok(new Date().getTime() !== log.now.getTime(), "new Date() is still pinned to the fake log's time");
});
