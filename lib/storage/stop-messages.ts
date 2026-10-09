// The two reasons storage work STOPS and is not retried in a loop. The wording lives here, free of server-only imports, because the admin
// screen compares against it to end its indexing / OCR loops at once instead of backing off and trying again.
export const STORAGE_BLOCKED_MESSAGE =
  "File storage is blocked (its usage limit was exceeded), so nothing was downloaded or changed. Everything saved so far is kept. Nothing is retried until storage is available again.";

export const DOWNLOAD_BUDGET_MESSAGE =
  "This file has been downloaded from storage several times recently, so further downloads are paused to protect the storage allowance. Everything saved so far is kept. Try again later.";

/** True for a message that means "stop now, do not retry": the loops must not go round again on it. */
export function isStorageStopMessage(message: string | null | undefined): boolean {
  return message === STORAGE_BLOCKED_MESSAGE || message === DOWNLOAD_BUDGET_MESSAGE;
}
