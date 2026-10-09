// One consistent way for the upload / import / intake paths to treat a blocked file store. Without it a blocked store surfaced as an uncaught 500
// (worksheets, exams, document intake) or as "please try again" (material upload / import) - which invites users to retry something that cannot
// work until storage is back. With it, every such path says plainly that storage is blocked and nothing was changed.
import { isBlockedBlobError } from "./blocked";
import { STORAGE_BLOCKED_MESSAGE } from "./stop-messages";

/** True for the store being blocked / suspended, however it was reported (our own error, or the Blob SDK's). */
export function isStorageBlocked(e: unknown): boolean {
  return isBlockedBlobError(e);
}

/** The message for a failed storage call: the plain "storage is blocked" text when that is the cause, otherwise `fallback`. */
export function storageFailureMessage(e: unknown, fallback: string): string {
  return isStorageBlocked(e) ? STORAGE_BLOCKED_MESSAGE : fallback;
}

/**
 * Runs a storage write. A blocked store is reported as `{ ok: false, blocked: true }` so the caller can answer "storage is blocked" without
 * retrying; any other error is re-thrown exactly as before.
 */
export async function uploadOrBlocked<T>(upload: () => Promise<T>): Promise<{ ok: true; value: T } | { ok: false; blocked: true }> {
  try {
    return { ok: true, value: await upload() };
  } catch (e) {
    if (isStorageBlocked(e)) return { ok: false, blocked: true };
    throw e;
  }
}
