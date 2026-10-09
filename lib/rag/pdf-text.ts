// Reading the text layer of a PDF held in memory. ONE place does it, because of a trap: pdf.js takes OWNERSHIP of the byte array it is
// given - after getDocumentProxy(bytes) that array is detached (length 0, its SHA-256 is the hash of nothing). The downloader keeps one copy of
// a book in memory and hands the same array to every caller, so a caller that gave it to pdf.js directly would empty the cache for everyone.
// This always gives pdf.js an independent copy and leaves the caller's bytes untouched.
export async function extractPdfPages(bytes: Uint8Array): Promise<string[]> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(new Uint8Array(bytes)); // new Uint8Array(typedArray) COPIES; pdf.js detaches the copy, not `bytes`
  const extracted = await extractText(pdf, { mergePages: false });
  return Array.isArray(extracted.text) ? extracted.text : [extracted.text];
}
