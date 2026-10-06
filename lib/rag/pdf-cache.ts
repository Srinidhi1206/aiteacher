// A textbook PDF is fetched from file storage by every indexing / page-reading call, and those calls come in long runs (one a minute for
// an hour). Storage bills (and can block the store over) the bytes transferred, so a run must not pay for the same 10-60 MB file again on every
// call. This keeps the last downloaded file in this server instance's memory for a few minutes: calls that land on the same warm instance reuse
// it, and nothing is ever stored anywhere but memory. One entry only, and never more than MAX_CACHED_BYTES.
const MAX_CACHED_BYTES = 70 * 1024 * 1024;
const TTL_MS = 10 * 60 * 1000;

let entry: { url: string; bytes: Uint8Array; at: number } | null = null;

export type PdfFetch = { ok: true; bytes: Uint8Array; fromCache: boolean } | { ok: false; reason: "download" | "too_big" };

/** Fetches `url`, refusing anything over `maxBytes` (checked from the headers first, so a refused file is not downloaded at all). */
export async function fetchPdfCached(url: string, maxBytes: number): Promise<PdfFetch> {
  if (entry && entry.url === url && Date.now() - entry.at < TTL_MS) {
    if (entry.bytes.length > maxBytes) return { ok: false, reason: "too_big" };
    entry.at = Date.now();
    return { ok: true, bytes: entry.bytes, fromCache: true };
  }
  try {
    const res = await fetch(url);
    if (!res.ok) return { ok: false, reason: "download" };
    if (Number(res.headers.get("content-length") ?? 0) > maxBytes) return { ok: false, reason: "too_big" };
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.length > maxBytes) return { ok: false, reason: "too_big" };
    entry = bytes.length <= MAX_CACHED_BYTES ? { url, bytes, at: Date.now() } : null;
    return { ok: true, bytes, fromCache: false };
  } catch {
    return { ok: false, reason: "download" };
  }
}
