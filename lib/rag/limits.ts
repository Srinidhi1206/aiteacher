/** Largest PDF that is read in one go (text layer extraction). Bigger files - and any file whose text layer is unusable - are read page by page (OCR) instead. */
export const MAX_DIRECT_READ_MB = 40;
