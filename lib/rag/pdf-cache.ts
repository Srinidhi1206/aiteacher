// Fetching a textbook PDF from file storage, safely. Every indexing / page-reading / chapter-linking call goes through here, and file storage
// bills (and can block the store over) every byte transferred - a cache HIT at the CDN still counts - so this is where the bytes are limited:
//   1. a circuit breaker: once storage answers "blocked" nothing is requested again until it closes (lib/storage/blocked.ts);
//   2. an in-memory copy of the last file, reused by later calls on the same server instance;
//   3. concurrent calls for the same file share ONE download;
//   4. a per-material / per-project download budget that holds across instances (lib/storage/download-budget.ts);
//   5. a file over the caller's size limit is refused from its headers and its body is cancelled, not downloaded;
//   6. a line of safe telemetry per call (outcome, bytes, duration - never the URL).
import { isBlockedHttp, markStorageBlocked, isStorageBreakerOpen } from "@/lib/storage/blocked";
import { auditLogLedger, checkDownloadBudget, defaultBudget, type DownloadBudget, type DownloadLedger } from "@/lib/storage/download-budget";
import { recordDownloadEvent, type DownloadEvent } from "@/lib/storage/telemetry";

const MAX_CACHED_BYTES = 70 * 1024 * 1024;
const TTL_MS = 10 * 60 * 1000;

export type PdfFailure = "download" | "too_big" | "blocked" | "budget";
export type PdfFetch = { ok: true; bytes: Uint8Array; fromCache: boolean } | { ok: false; reason: PdfFailure; retryAfterMs?: number };

export interface PdfDownloaderDeps {
  fetchFn?: typeof fetch;
  ledger?: DownloadLedger;
  budget?: () => DownloadBudget;
  now?: () => number;
  log?: (event: DownloadEvent) => void;
}

export function createPdfDownloader(deps: PdfDownloaderDeps = {}) {
  const fetchFn = deps.fetchFn ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
  const ledger = deps.ledger ?? auditLogLedger;
  const budgetOf = deps.budget ?? defaultBudget;
  const now = deps.now ?? Date.now;
  const log = deps.log ?? ((e: DownloadEvent) => recordDownloadEvent(e));

  let entry: { url: string; bytes: Uint8Array; at: number } | null = null;
  const inflight = new Map<string, Promise<PdfFetch>>();

  async function download(url: string, maxBytes: number, materialId: string | undefined): Promise<PdfFetch> {
    const started = now();
    if (materialId) {
      const decision = await checkDownloadBudget(ledger, materialId, budgetOf(), started);
      if (!decision.ok) {
        log({ outcome: "budget", materialId, reason: decision.scope });
        return { ok: false, reason: "budget", retryAfterMs: decision.retryAfterMs };
      }
    }
    try {
      const res = await fetchFn(url);
      if (!res.ok) {
        if (res.status === 403) {
          const head = (await res.text().catch(() => "")).slice(0, 200);
          if (isBlockedHttp(res.status, head)) {
            markStorageBlocked(now());
            log({ outcome: "blocked", materialId, ms: now() - started });
            return { ok: false, reason: "blocked" };
          }
        } else {
          await res.body?.cancel().catch(() => {});
        }
        log({ outcome: "error", materialId, reason: `http ${res.status}`, ms: now() - started });
        return { ok: false, reason: "download" };
      }
      if (Number(res.headers.get("content-length") ?? 0) > maxBytes) {
        await res.body?.cancel().catch(() => {}); // refused from the headers: the body is not downloaded
        log({ outcome: "too_big", materialId, ms: now() - started });
        return { ok: false, reason: "too_big" };
      }
      const bytes = new Uint8Array(await res.arrayBuffer());
      if (materialId) await ledger.record(materialId, bytes.length, now()).catch(() => {});
      log({ outcome: "miss", materialId, bytes: bytes.length, ms: now() - started });
      if (bytes.length > maxBytes) return { ok: false, reason: "too_big" };
      entry = bytes.length <= MAX_CACHED_BYTES ? { url, bytes, at: now() } : null;
      return { ok: true, bytes, fromCache: false };
    } catch (e) {
      log({ outcome: "error", materialId, reason: (e as Error)?.name ?? "error", ms: now() - started });
      return { ok: false, reason: "download" };
    }
  }

  /** `materialId` enables the download budget (and labels the telemetry); the URL itself is never logged. */
  async function fetchPdf(url: string, maxBytes: number, opts: { materialId?: string } = {}): Promise<PdfFetch> {
    if (isStorageBreakerOpen(now())) {
      log({ outcome: "blocked", materialId: opts.materialId, reason: "breaker open" });
      return { ok: false, reason: "blocked" };
    }
    if (entry && entry.url === url && now() - entry.at < TTL_MS) {
      log({ outcome: "hit", materialId: opts.materialId, bytes: entry.bytes.length });
      if (entry.bytes.length > maxBytes) return { ok: false, reason: "too_big" };
      entry.at = now();
      return { ok: true, bytes: entry.bytes, fromCache: true };
    }
    const running = inflight.get(url);
    if (running) {
      log({ outcome: "coalesced", materialId: opts.materialId });
      const shared = await running;
      return shared.ok && shared.bytes.length > maxBytes ? { ok: false, reason: "too_big" } : shared.ok ? { ...shared, fromCache: true } : shared;
    }
    const p = download(url, maxBytes, opts.materialId).finally(() => inflight.delete(url));
    inflight.set(url, p);
    return p;
  }

  return { fetchPdf, clear: () => (entry = null) };
}

const shared = createPdfDownloader();

export const fetchPdfCached = shared.fetchPdf;
