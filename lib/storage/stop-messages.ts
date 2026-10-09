// The reasons storage work STOPS and is not retried in a loop, plus one message for a temporary storage hiccup. The wording lives here, free of
// server-only imports, because the admin screen compares against it to end its indexing / OCR loops at once instead of backing off and trying again.
export const STORAGE_BLOCKED_MESSAGE =
  "File storage is blocked (its usage limit was exceeded), so nothing was downloaded or changed. Everything saved so far is kept. Nothing is retried until storage is available again.";

export const DOWNLOAD_BUDGET_MESSAGE =
  "This file has been downloaded from storage several times recently, so further downloads are paused to protect the storage allowance. Everything saved so far is kept. Try again later.";

/** The allowance could not be checked (its record could not be read or written), so - to be safe - nothing was downloaded. */
export const DOWNLOAD_BUDGET_UNAVAILABLE_MESSAGE =
  "The download allowance for this file could not be checked right now, so nothing was downloaded. Everything saved so far is kept. Try again in a moment.";

/** NOT a stop: a temporary problem reading the saved page-reading results. Nothing was changed and nothing was downloaded; trying again later is fine. */
export const OCR_STORAGE_UNAVAILABLE_MESSAGE =
  "The saved page-reading results could not be read just now (a temporary storage problem). Nothing was changed. Try again in a moment.";

/** True for a message that means "stop now, do not retry": the loops must not go round again on it. */
export function isStorageStopMessage(message: string | null | undefined): boolean {
  return message === STORAGE_BLOCKED_MESSAGE || message === DOWNLOAD_BUDGET_MESSAGE || message === DOWNLOAD_BUDGET_UNAVAILABLE_MESSAGE;
}
