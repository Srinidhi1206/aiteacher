// Counters and one-line logs for file downloads, so a repeat-download problem is visible in minutes instead of after a limit is hit.
// Deliberately narrow: only an allow-listed set of fields can ever be logged - an outcome, a material id (a database id, never a URL), a
// byte count, a duration and a short reason. A URL, token or header can not be passed in, and anything URL-shaped in a reason is removed.

export type DownloadOutcome = "hit" | "miss" | "coalesced" | "blocked" | "budget" | "too_big" | "error";

export interface DownloadEvent {
  outcome: DownloadOutcome;
  materialId?: string;
  bytes?: number;
  ms?: number;
  reason?: string;
}

export interface StorageStats {
  hits: number;
  misses: number;
  coalesced: number;
  blocked: number;
  budget: number;
  tooBig: number;
  errors: number;
  bytesDownloaded: number;
}

const fresh = (): StorageStats => ({ hits: 0, misses: 0, coalesced: 0, blocked: 0, budget: 0, tooBig: 0, errors: 0, bytesDownloaded: 0 });
let stats = fresh();

export function getStorageStats(): StorageStats {
  return { ...stats };
}

export function resetStorageStats(): void {
  stats = fresh();
}

const ID = /^[A-Za-z0-9_-]{8,40}$/;

/** Strips anything that looks like a URL or a long token out of free text. */
export function safeReason(reason: string | undefined): string | undefined {
  if (!reason) return undefined;
  return reason
    .replace(/https?:\/\/\S+/gi, "[url]")
    .replace(/[A-Za-z0-9_\-]{32,}/g, "[redacted]")
    .slice(0, 80);
}

export function recordDownloadEvent(event: DownloadEvent, log: (line: string) => void = (line) => console.info(line)): void {
  switch (event.outcome) {
    case "hit":
      stats.hits++;
      break;
    case "miss":
      stats.misses++;
      stats.bytesDownloaded += event.bytes ?? 0;
      break;
    case "coalesced":
      stats.coalesced++;
      break;
    case "blocked":
      stats.blocked++;
      break;
    case "budget":
      stats.budget++;
      break;
    case "too_big":
      stats.tooBig++;
      break;
    case "error":
      stats.errors++;
      break;
  }
  const safe: Record<string, string | number> = { outcome: event.outcome };
  if (event.materialId && ID.test(event.materialId)) safe.material = event.materialId;
  if (typeof event.bytes === "number") safe.bytes = Math.round(event.bytes);
  if (typeof event.ms === "number") safe.ms = Math.round(event.ms);
  const reason = safeReason(event.reason);
  if (reason) safe.reason = reason;
  log(`[storage-download] ${JSON.stringify(safe)}`);
}
