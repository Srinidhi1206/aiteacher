// Lightweight signed-cookie session — no extra npm packages required, and
// works in both the Node runtime (API routes) and the Edge runtime
// (middleware) because it only uses the standard Web Crypto API.
//
// The cookie payload is: base64url(json).base64url(hmacSignature)
// This is NOT encrypted, only signed — don't put secrets in the payload,
// just id/name/role, which is fine for our purposes.

import type { Role } from "./users";

export const SESSION_COOKIE = "maiteacher_session";

// Deliberately NOT resolved at module load time (no top-level `const SECRET
// = ...`): this module is imported by middleware.ts, which Next.js bundles
// for every request, and by `next build`'s page-data collection - throwing
// eagerly here would fail the build itself whenever SESSION_SECRET isn't
// set, which is the normal state for this repo's local/CI environment (see
// docs/DATABASE.md). Resolving lazily, inside getKey() below, means the
// check only runs when a session is actually signed/verified at request
// time - exactly when a missing secret in production actually matters.
const DEV_FALLBACK_SECRET = "dev-only-insecure-secret-change-me";

// Production refuses a secret that is short or obviously guessable, not just a missing one:
// an HMAC key anyone can guess lets them forge a session for any account, including the
// Super Admin. 32+ characters, not this repo's published dev fallback, not a placeholder
// or a single repeated character. Messages name the rule, never the value.
const MIN_PRODUCTION_SECRET_LENGTH = 32;
const PLACEHOLDER_HINTS = ["change-me", "changeme", "your-secret", "yoursecret", "secret-here", "example", "placeholder", "password", "dev-only"];

function productionSecretProblem(secret: string): string | null {
  if (secret.length < MIN_PRODUCTION_SECRET_LENGTH) return `it is shorter than ${MIN_PRODUCTION_SECRET_LENGTH} characters`;
  if (secret === DEV_FALLBACK_SECRET) return "it is the development fallback published in the source code";
  const lower = secret.toLowerCase();
  if (PLACEHOLDER_HINTS.some((hint) => lower.includes(hint))) return "it looks like a placeholder";
  if (new Set(secret).size < 8) return "it has too little variety to be random";
  return null;
}

function resolveSessionSecret(): string {
  const configured = process.env.SESSION_SECRET;
  if (configured) {
    if (process.env.NODE_ENV === "production") {
      const problem = productionSecretProblem(configured);
      if (problem) {
        throw new Error(`SESSION_SECRET is not acceptable for production: ${problem}. Set it to a long random value (for example: openssl rand -base64 48).`);
      }
    }
    return configured;
  }

  if (process.env.NODE_ENV === "production") {
    // Fail closed: a production deployment with no SESSION_SECRET must
    // never silently sign sessions with a secret that's published in this
    // repo's source code. The error message names the missing variable,
    // never its value (there is no value to expose here).
    throw new Error("SESSION_SECRET is not configured. Set SESSION_SECRET to a strong random value before starting in production.");
  }

  // Development/test only - matches the pre-existing fallback/demo
  // workflow (see docs/DEMO_CREDENTIALS.md) and lets local dev and the
  // Stage B fallback-auth browser tests keep working without any setup.
  return DEV_FALLBACK_SECRET;
}

/** Start-up check (instrumentation.ts): throws in production when SESSION_SECRET is missing or weak. */
export function assertSessionSecretConfigured(): void {
  resolveSessionSecret();
}

export interface SessionPayload {
  id: string;
  name: string;
  role: Role;
  /** Student-only: the class this student is enrolled in (Class 1-10). */
  class?: string;
  /** Teacher-only: classes this teacher currently teaches. */
  assignedClasses?: string[];
  /** Teacher-only: subjects this teacher currently teaches. */
  subjects?: string[];
}

// Internal wire format only - `iat` is added by signSession()/stripped
// back off by verifySession() so every existing caller keeps working with
// plain SessionPayload, unaware this exists.
type SignedPayload = SessionPayload & { iat: number };

// Stage L: kept as the single source of truth for how long a session may
// live, both for the cookie's own `maxAge` (app/api/auth/login/route.ts)
// and for the server-side expiry check below - previously only the
// cookie's client-enforced maxAge existed, meaning the server would
// accept a validly-signed token of any age forever. A token is unencrypted
// but signed, so this doesn't defend against a stolen valid token being
// used immediately - it bounds how long a *leaked* token stays useful,
// consistent with the cookie's own stated lifetime rather than silently
// exceeding it.
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 days

function toBase64Url(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let str = "";
  for (const b of arr) str += String.fromCharCode(b);
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(input: string): ArrayBuffer {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/").padEnd(input.length + ((4 - (input.length % 4)) % 4), "=");
  const str = atob(padded);
  const arr = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) arr[i] = str.charCodeAt(i);
  return arr.buffer;
}

async function getKey() {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(resolveSessionSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

export async function signSession(payload: SessionPayload): Promise<string> {
  const key = await getKey();
  const signed: SignedPayload = { ...payload, iat: Date.now() };
  const json = JSON.stringify(signed);
  const payloadB64 = toBase64Url(new TextEncoder().encode(json));
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payloadB64));
  const sigB64 = toBase64Url(sig);
  return `${payloadB64}.${sigB64}`;
}

export async function verifySession(token: string | undefined | null): Promise<SessionPayload | null> {
  if (!token) return null;
  const [payloadB64, sigB64] = token.split(".");
  if (!payloadB64 || !sigB64) return null;
  // Resolved outside the try/catch below on purpose: a missing
  // SESSION_SECRET in production is a configuration error, not "this
  // particular cookie failed to verify" - it must propagate to the caller
  // (middleware.ts / getCurrentSession()) rather than be swallowed into a
  // misleadingly normal "not logged in" result.
  const key = await getKey();
  try {
    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      fromBase64Url(sigB64),
      new TextEncoder().encode(payloadB64)
    );
    if (!valid) return null;
    const json = new TextDecoder().decode(fromBase64Url(payloadB64));
    const signed = JSON.parse(json) as Partial<SignedPayload>;

    // Server-side expiry, independent of the cookie's own client-enforced
    // maxAge (see SESSION_MAX_AGE_SECONDS above). Tokens signed before
    // this field existed have no `iat` at all - treated as expired rather
    // than trusted indefinitely, so this change can't accidentally grant
    // an old token unbounded life.
    if (typeof signed.iat !== "number" || Date.now() - signed.iat > SESSION_MAX_AGE_SECONDS * 1000) {
      return null;
    }

    const { iat: _iat, ...payload } = signed;
    return payload as SessionPayload;
  } catch {
    return null;
  }
}
