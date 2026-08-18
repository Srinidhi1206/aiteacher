// Lightweight signed-cookie session — no extra npm packages required, and
// works in both the Node runtime (API routes) and the Edge runtime
// (middleware) because it only uses the standard Web Crypto API.
//
// The cookie payload is: base64url(json).base64url(hmacSignature)
// This is NOT encrypted, only signed — don't put secrets in the payload,
// just id/name/role, which is fine for our purposes.

import type { Role } from "./users";

export const SESSION_COOKIE = "maiteacher_session";
const SECRET = process.env.SESSION_SECRET || "dev-only-insecure-secret-change-me";

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
    new TextEncoder().encode(SECRET),
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
  try {
    const key = await getKey();
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
