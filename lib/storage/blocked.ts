// Recognising a BLOCKED file store (Vercel answers a Hobby store over its limits with HTTP 403 "Your store is blocked" on file URLs and with a
// "store has been suspended" error from the SDK) and making sure nothing keeps hammering it. The first detection opens a circuit breaker for
// this server instance: until it closes, every storage call fails at once WITHOUT touching the network. Nothing here retries.
import { STORAGE_BLOCKED_MESSAGE } from "./stop-messages";

export class StorageBlockedError extends Error {
  constructor() {
    super(STORAGE_BLOCKED_MESSAGE);
    this.name = "StorageBlockedError";
  }
}

/** How long one instance refuses storage calls after seeing the block. Short enough to recover on its own once storage is unblocked. */
export const BREAKER_MS = 10 * 60 * 1000;

let openedAt: number | null = null;

export function markStorageBlocked(now: number = Date.now()): void {
  openedAt = now;
}

export function isStorageBreakerOpen(now: number = Date.now()): boolean {
  return openedAt !== null && now - openedAt < BREAKER_MS;
}

/** Throws StorageBlockedError, with no network call, while the breaker is open. */
export function assertStorageAvailable(now: number = Date.now()): void {
  if (isStorageBreakerOpen(now)) throw new StorageBlockedError();
}

export function resetStorageBreaker(): void {
  openedAt = null;
}

/** A file URL answered 403 with the "blocked" / "suspended" text (an ordinary 403 is not this). */
export function isBlockedHttp(status: number, bodyHead: string): boolean {
  return status === 403 && /store is blocked|suspended/i.test(bodyHead);
}

/** An error thrown by the Blob SDK that means the store is suspended / blocked. */
export function isBlockedBlobError(e: unknown): boolean {
  if (e instanceof StorageBlockedError) return true;
  const err = e as { name?: unknown; message?: unknown } | null;
  const name = typeof err?.name === "string" ? err.name : "";
  const message = typeof err?.message === "string" ? err.message : "";
  return name === "BlobStoreSuspendedError" || /store has been suspended|store is blocked/i.test(message);
}

/** Runs one storage call: refused outright while the breaker is open, and a blocked-store answer opens it and becomes StorageBlockedError. */
export async function guardStorage<T>(call: () => Promise<T>, now: () => number = Date.now): Promise<T> {
  assertStorageAvailable(now());
  try {
    return await call();
  } catch (e) {
    if (e instanceof StorageBlockedError) throw e;
    if (isBlockedBlobError(e)) {
      markStorageBlocked(now());
      throw new StorageBlockedError();
    }
    throw e;
  }
}
