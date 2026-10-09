// Fetching a textbook PDF from file storage, safely. Every indexing / page-reading / chapter-linking call goes through here, and file storage
// bills (and can block the store over) every byte transferred - a cache HIT at the CDN still counts - so this is where the bytes are limited:
//   1. a circuit breaker: once storage answers "blocked" nothing is requested again until it closes (lib/storage/blocked.ts);
//   2. an in-memory copy of the last file, reused by later calls on the same server instance;
//   3. concurrent calls for the same file share ONE download;
//   4. a per-material / per-project download budget that holds across instances, reserved atomically BEFORE the download and failing closed
//      (lib/storage/download-budget.ts);
//   5. a file over the caller's size limit is refused from its headers (body cancelled) - and, if it sends no length, cut off mid-stream;
//   6. a line of safe telemetry per call (outcome, bytes, duration - never the URL).
//
// BYTES AND THEIR HASH: the SHA-256 is computed here, once, right after the download and BEFORE the array is shared - it identifies the file and
// must never be recomputed from bytes that a consumer (pdf.js detaches the array it is given) may have emptied. Consumers must give pdf.js a
// copy (lib/rag/pdf-text.ts). As a second line of defence a cache hit is integrity-checked: a damaged (emptied) copy is dropped and re-downloaded
// instead of being handed out.
import { createHash } from "node:crypto";
import { isBlockedHttp, markStorageBlocked, isStorageBreakerOpen } from "@/lib/storage/blocked";
import { auditLogLedger, defaultBudget, type DownloadBudget, type DownloadLedger } from "@/lib/storage/download-budget";
import { recordDownloadEvent, type DownloadEvent } from "@/lib/storage/telemetry";

const MAX_CACHED_BYTES = 70 * 1024 * 1024;
const TTL_MS = 10 * 60 * 1000;
/** What a reservation counts when the caller does not know the file's size. */
const DEFAULT_EXPECTED_BYTES = 10 * 1024 * 1024;

export type PdfFailure = "download" | "too_big" | "blocked" | "budget" | "budget_unavailable";
export type PdfFetch =
  | { ok: true; bytes: Uint8Array; /** SHA-256 of the file as downloaded - always the true hash, never recomputed from shared bytes. */ sha256: string; fromCache: boolean }
  | { ok: false; reason: PdfFailure; retryAfterMs?: number };

export interface PdfDownloaderDeps {
  fetchFn?: typeof fetch;
  ledger?: DownloadLedger;
  budget?: () => DownloadBudget;
  now?: () => number;
  log?: (event: DownloadEvent) => void;
}

/** Reads a response body, giving up (and cancelling the transfer) as soon as it exceeds `maxBytes`. Returns null when it was too big. */
async function readCapped(res: Response, maxBytes: number): Promise<Uint8Array | null> {
  if (!res.body) {
    const all = new Uint8Array(await res.arrayBuffer());
    return all.length > maxBytes ? null : all;
  }
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}

export function createPdfDownloader(deps: PdfDownloaderDeps = {}) {
  const fetchFn = deps.fetchFn ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
  const ledger = deps.ledger ?? auditLogLedger;
  const budgetOf = deps.budget ?? defaultBudget;
  const now = deps.now ?? Date.now;
  const log = deps.log ?? ((e: DownloadEvent) => recordDownloadEvent(e));

  let entry: { url: string; bytes: Uint8Array; length: number; sha256: string; at: number } | null = null;
  const inflight = new Map<string, Promise<PdfFetch>>();

  async function download(url: string, maxBytes: number, materialId: string | undefined, expectedBytes: number): Promise<PdfFetch> {
    const started = now();
    let reservationId: string | null = null;
    if (materialId) {
      try {
        const reserved = await ledger.reserve(materialId, expectedBytes, budgetOf(), started);
        if (!reserved.ok) {
          log({ outcome: "budget", materialId, reason: reserved.scope });
          return { ok: false, reason: "budget", retryAfterMs: reserved.retryAfterMs };
        }
        reservationId = reserved.id;
      } catch {
        // The allowance cannot be checked or recorded: fail CLOSED. Downloading anyway is exactly the uncontrolled behaviour this prevents.
        log({ outcome: "budget", materialId, reason: "ledger unavailable" });
        return { ok: false, reason: "budget_unavailable" };
      }
    }
    /** Nothing was transferred, so the reservation is given back. (Anything uncertain stays counted: the safe direction.) */
    const release = async () => {
      if (reservationId) await ledger.release(reservationId).catch(() => {});
    };
    try {
      const res = await fetchFn(url, { cache: "no-store" });
      if (!res.ok) {
        if (res.status === 403) {
          const head = (await res.text().catch(() => "")).slice(0, 200);
          if (isBlockedHttp(res.status, head)) {
            markStorageBlocked(now());
            await release();
            log({ outcome: "blocked", materialId, ms: now() - started });
            return { ok: false, reason: "blocked" };
          }
        } else {
          await res.body?.cancel().catch(() => {});
        }
        await release();
        log({ outcome: "error", materialId, reason: `http ${res.status}`, ms: now() - started });
        return { ok: false, reason: "download" };
      }
      if (Number(res.headers.get("content-length") ?? 0) > maxBytes) {
        await res.body?.cancel().catch(() => {}); // refused from the headers: the body is not downloaded
        await release();
        log({ outcome: "too_big", materialId, ms: now() - started });
        return { ok: false, reason: "too_big" };
      }
      const bytes = await readCapped(res, maxBytes);
      if (!bytes) {
        log({ outcome: "too_big", materialId, ms: now() - started, reason: "no length header; cut off at the limit" });
        return { ok: false, reason: "too_big" };
      }
      const sha256 = createHash("sha256").update(bytes).digest("hex"); // BEFORE the array is shared with anyone
      log({ outcome: "miss", materialId, bytes: bytes.length, ms: now() - started });
      entry = bytes.length <= MAX_CACHED_BYTES ? { url, bytes, length: bytes.length, sha256, at: now() } : null;
      return { ok: true, bytes, sha256, fromCache: false };
    } catch (e) {
      log({ outcome: "error", materialId, reason: (e as Error)?.name ?? "error", ms: now() - started });
      return { ok: false, reason: "download" };
    }
  }

  /** `materialId` enables the download budget (and labels the telemetry); the URL itself is never logged. */
  async function fetchPdf(url: string, maxBytes: number, opts: { materialId?: string; expectedBytes?: number } = {}): Promise<PdfFetch> {
    if (isStorageBreakerOpen(now())) {
      log({ outcome: "blocked", materialId: opts.materialId, reason: "breaker open" });
      return { ok: false, reason: "blocked" };
    }
    if (entry && entry.url === url && now() - entry.at < TTL_MS) {
      if (entry.bytes.byteLength === entry.length) {
        log({ outcome: "hit", materialId: opts.materialId, bytes: entry.length });
        if (entry.length > maxBytes) return { ok: false, reason: "too_big" };
        entry.at = now();
        return { ok: true, bytes: entry.bytes, sha256: entry.sha256, fromCache: true };
      }
      // The cached array was emptied by a consumer (pdf.js detaches what it is given). Never hand that out: drop it and download again.
      log({ outcome: "error", materialId: opts.materialId, reason: "cached copy was damaged; evicted" });
      entry = null;
    }
    const running = inflight.get(url);
    if (running) {
      log({ outcome: "coalesced", materialId: opts.materialId });
      const shared = await running;
      if (!shared.ok) return shared;
      return shared.bytes.length > maxBytes ? { ok: false, reason: "too_big" } : { ...shared, fromCache: true };
    }
    const p = download(url, maxBytes, opts.materialId, opts.expectedBytes ?? DEFAULT_EXPECTED_BYTES).finally(() => inflight.delete(url));
    inflight.set(url, p);
    return p;
  }

  return { fetchPdf, clear: () => (entry = null) };
}

const shared = createPdfDownloader();

export const fetchPdfCached = shared.fetchPdf;
