// Brute-force protection for sign-in, shared by every server instance.
//
// WHY THE DATABASE: the app runs as serverless functions, so a counter in one instance's memory is not a limit at all (guesses spread over instances; every deploy resets it).
// The count is kept in the existing audit log (no schema change), one small row per sign-in ATTEMPT THAT HAS NOT SUCCEEDED.
//
// HOW A SIGN-IN IS LIMITED (all over a sliding 15 minutes; LOGIN_LIMITS):
//   - the same client address trying the same username: 5;
//   - one client address trying at all (a school shares one address, so this is generous): 60;
//   - one username tried from anywhere (a distributed attack on one account): 20.
//
// HOW CONCURRENT GUESSES ARE HELD TO THE LIMIT: checking the count and recording the failure AFTER the (slow) password check would let a burst of parallel requests all pass the
// check before any failure was written. So an attempt first RESERVES its place - it writes its row before the password is checked - and then counts again, its own row included. Under
// the database's default isolation every row committed before a count starts is visible to it, so of any set of simultaneous attempts at most the limit can see a count within
// the limit. An attempt over the limit deletes its own row and is refused; an attempt that SUCCEEDS deletes its row too (a correct password, including one for an account that is
// still pending or suspended, is not a failed guess and leaves nothing behind). A wrong password keeps its row. If a request dies between reserving and answering, its row stays and
// counts as a failure: the conservative direction.
//
// WHAT IT COSTS: an attempt already over the limit is refused after 3 indexed-range reads and writes nothing. An attempt that is let through costs 3 reads + 1 write + 3 reads, plus
// 1 delete if it succeeds. Counting looks at the audit rows of the last 15 minutes only (the createdAt index) and filters them by key.
//
// PRIVACY: the username and the address are stored only as HMAC-SHA256 values keyed from SESSION_SECRET (a plain hash of an IPv4 address can be reversed by trying all 4 billion), so
// someone who can read the table learns neither, and cannot test a guessed username without the secret. Rotating SESSION_SECRET simply restarts the counts. No password is ever
// handled here, and nothing raw is logged.
//
// WHAT IT CANNOT DO (be clear about this):
//   - A username-wide limit means a determined attacker who tries a known username from several addresses can keep that account's owner out of signing in for up to 15 minutes at a
//     time (each re-lock costs the attacker 20 more failed attempts, at most 5 per address). The address limits stop one machine doing it alone. That is the usual trade-off of any
//     lockout and is accepted here; the owner is never locked out for longer than the window.
//   - Writes are bounded per client address (60 per 15 minutes), NOT globally. A large botnet rotating addresses and usernames could still write many rows, and each later attempt
//     reads the window's rows, so the cost grows with the size of the attack. Protection robust at that scale belongs in front of the application: a platform rate-limit rule on this
//     route (Vercel Firewall) and/or a shared store such as Redis. Both need configuration or a new service, so neither is added here.
// If the database cannot be read or written the attempt is let through (failing closed would lock everyone out whenever the database hiccups); this is logged by name only.
import { createHash, createHmac } from "node:crypto";
import type { prisma } from "@/lib/prisma";

export const LOGIN_WINDOW_MS = 15 * 60 * 1000;
export const LOGIN_LIMITS = { perAddressAndUsername: 5, perAddress: 60, perUsername: 20 } as const;

export type ThrottleDb = Pick<typeof prisma, "auditLog">;
export interface LoginAttempt {
  /** The client's address, or null when it is not known or not trustworthy (then only the per-username limit applies). */
  address: string | null;
  username: string;
}

// ---- identifiers -----------------------------------------------------------------------------------------------------------------------------------------------------

const DEV_FALLBACK_SECRET = "dev-only-insecure-secret-change-me"; // the same development fallback the session code uses; production refuses to start without a real SESSION_SECRET

function key(): Buffer {
  const secret = process.env.SESSION_SECRET || DEV_FALLBACK_SECRET;
  return createHash("sha256").update(`login-throttle-v1|${secret}`).digest();
}
const mac = (kind: "user" | "addr", value: string) => createHmac("sha256", key()).update(`${kind}|${value}`).digest("hex").slice(0, 32);
const userPart = (username: string) => mac("user", username.trim().toLowerCase());
const addressPart = (address: string | null) => (address ? mac("addr", address.trim().toLowerCase()) : "noaddr");
const resourceOf = (a: LoginAttempt) => `LoginFailure:${addressPart(a.address)}|${userPart(a.username)}`;

// ---- the client's address ---------------------------------------------------------------------------------------------------------------------------------------------

const IPV4 = /^(?:\d{1,3}\.){3}\d{1,3}$/;
const IPV6 = /^[0-9a-fA-F:.]{2,45}$/;
/** Whether a header value looks like an IP address at all (so garbage, long strings and "unknown" are never used as a key). */
export function isPlausibleAddress(value: string): boolean {
  if (value.length > 45) return false;
  if (IPV4.test(value)) return value.split(".").every((n) => Number(n) <= 255);
  return value.includes(":") && IPV6.test(value);
}

/**
 * The client's address from the platform's forwarding headers - but ONLY when this really is the Vercel deployment, where the platform sets those headers itself and replaces any
 * value the client sent. Anywhere else (local development, self-hosting behind an unknown proxy, or no proxy) any client can send any X-Forwarded-For, so it is ignored and the
 * address is unknown (null): then only the per-username limit applies, which cannot be dodged by changing a header.
 */
export function clientAddress(headers: { get(name: string): string | null }, trustForwardedHeaders: boolean = process.env.VERCEL === "1"): string | null {
  if (!trustForwardedHeaders) return null;
  const candidates = [headers.get("x-forwarded-for")?.split(",")[0], headers.get("x-real-ip")];
  for (const c of candidates) {
    const v = c?.trim();
    if (v && isPlausibleAddress(v)) return v;
  }
  return null;
}

// ---- reserving an attempt ---------------------------------------------------------------------------------------------------------------------------------------------

export type Reservation = { allowed: false } | { allowed: true; release: () => Promise<void> };
const NOOP = async () => undefined;

async function counts(db: ThrottleDb, attempt: LoginAttempt, now: Date) {
  const since = new Date(now.getTime() - LOGIN_WINDOW_MS);
  const base = { action: "LOGIN" as const, createdAt: { gt: since } };
  const [pair, perAddress, perUser] = await Promise.all([
    db.auditLog.count({ where: { ...base, resource: resourceOf(attempt) } }),
    attempt.address ? db.auditLog.count({ where: { ...base, resource: { startsWith: `LoginFailure:${addressPart(attempt.address)}|` } } }) : Promise.resolve(0),
    db.auditLog.count({ where: { ...base, resource: { endsWith: `|${userPart(attempt.username)}` } } }),
  ]);
  return { pair, perAddress, perUser };
}
const over = (c: { pair: number; perAddress: number; perUser: number }, atLeast: boolean) => {
  const bump = atLeast ? 0 : 1; // before reserving, "at the limit" is enough; after reserving the attempt's own row is counted, so "over" is needed
  return c.pair >= LOGIN_LIMITS.perAddressAndUsername + bump || c.perAddress >= LOGIN_LIMITS.perAddress + bump || c.perUser >= LOGIN_LIMITS.perUsername + bump;
};

/**
 * Asks to make one sign-in attempt. `{ allowed: false }` means refuse it (HTTP 429) without checking the password. Otherwise the attempt holds a reserved place; the caller must
 * call `release()` unless the password was WRONG (a wrong password keeps its place as the failure record).
 */
export async function reserveLoginAttempt(db: ThrottleDb, attempt: LoginAttempt, now: Date = new Date()): Promise<Reservation> {
  let release: () => Promise<void> = NOOP;
  try {
    // 1. Cheap refusal for an attempt that is plainly over the limit already: reads only, nothing written.
    if (over(await counts(db, attempt, now), true)) return { allowed: false };

    // 2. Reserve a place, then count again with this attempt's own row included (this is what holds a burst of simultaneous attempts to the limit).
    const row = await db.auditLog.create({ data: { userId: null, action: "LOGIN", resource: resourceOf(attempt), message: "Unsuccessful sign-in attempt" }, select: { id: true } });
    release = async () => {
      try {
        await db.auditLog.delete({ where: { id: row.id } });
      } catch (err) {
        console.error("[auth] could not release a sign-in reservation", (err as Error)?.name); // the row stays and counts as a failure: the conservative direction
      }
    };
    if (over(await counts(db, attempt, now), false)) {
      await release();
      return { allowed: false };
    }
    return { allowed: true, release };
  } catch (err) {
    console.error("[auth] sign-in limit check failed - letting the attempt through", (err as Error)?.name);
    // If the reservation had already been written, `release` still removes it on success; if nothing was written it does nothing.
    return { allowed: true, release };
  }
}
