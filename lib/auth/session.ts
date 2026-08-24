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

function resolveSessionSecret(): string {
  const configured = process.env.SESSION_SECRET;
  if (configured) return configured;

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
  const json = JSON.stringify(payload);
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
    return JSON.parse(json) as SessionPayload;
  } catch {
    return null;
  }
}
