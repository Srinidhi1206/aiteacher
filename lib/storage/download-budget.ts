// A cap on how often one textbook may be downloaded in full from file storage. The in-memory cache (lib/rag/pdf-cache.ts) only helps while
// consecutive calls land on the same warm server instance; this budget holds ACROSS instances, so a runaway loop can never repeat the
// 11 GB incident: after a few downloads of the same file, further ones are refused until the window passes.
//
// The ledger is an interface so tests can use a fake. The default one writes a plain line to the existing audit log (one row per real
// download - cache hits record nothing) and reads them back, so no new table is needed.
export interface DownloadBudget {
  perMaterialPerHour: number;
  perMaterialPerDayBytes: number;
  globalPerDayBytes: number;
}

const MB = 1024 * 1024;

function fromEnv(name: string, fallback: number): number {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

/** Defaults: 6 full downloads of one book per hour, 750 MB per book per day, 2 GB per day for the whole project (Hobby allows 10 GB a month). */
export function defaultBudget(): DownloadBudget {
  return {
    perMaterialPerHour: fromEnv("STORAGE_DOWNLOADS_PER_MATERIAL_PER_HOUR", 6),
    perMaterialPerDayBytes: fromEnv("STORAGE_BYTES_PER_MATERIAL_PER_DAY_MB", 750) * MB,
    globalPerDayBytes: fromEnv("STORAGE_BYTES_PER_DAY_MB", 2048) * MB,
  };
}

export interface LedgerEntry {
  at: number;
  bytes: number;
}

export interface DownloadLedger {
  /** Downloads of one material since `sinceMs` (epoch ms), or of every material when no id is given. */
  entries(sinceMs: number, materialId?: string): Promise<LedgerEntry[]>;
  record(materialId: string, bytes: number, at: number): Promise<void>;
}

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

export type BudgetDecision = { ok: true } | { ok: false; scope: "material-hour" | "material-day" | "project-day"; retryAfterMs: number };

/** Whether one more full download of this material may start now. Never throws: a ledger that cannot be read allows the download. */
export async function checkDownloadBudget(
  ledger: DownloadLedger,
  materialId: string,
  budget: DownloadBudget = defaultBudget(),
  now: number = Date.now(),
): Promise<BudgetDecision> {
  try {
    const day = await ledger.entries(now - DAY);
    const mine = await ledger.entries(now - DAY, materialId);
    const mineHour = mine.filter((e) => e.at > now - HOUR);
    const retry = (list: LedgerEntry[], window: number) => Math.max(1000, Math.min(...list.map((e) => e.at)) + window - now);

    if (mineHour.length >= budget.perMaterialPerHour) return { ok: false, scope: "material-hour", retryAfterMs: retry(mineHour, HOUR) };
    if (mine.reduce((n, e) => n + e.bytes, 0) >= budget.perMaterialPerDayBytes) return { ok: false, scope: "material-day", retryAfterMs: retry(mine, DAY) };
    if (day.reduce((n, e) => n + e.bytes, 0) >= budget.globalPerDayBytes) return { ok: false, scope: "project-day", retryAfterMs: retry(day, DAY) };
    return { ok: true };
  } catch {
    return { ok: true };
  }
}

const MARK = "[pdf-download]";

/** The audit-log-backed ledger used in production. Prisma is loaded only when it is actually used, so tests never touch a database. */
export const auditLogLedger: DownloadLedger = {
  async entries(sinceMs, materialId) {
    const { prisma } = await import("@/lib/prisma");
    const rows = await prisma.auditLog.findMany({
      where: { action: "USER_UPDATE", message: { startsWith: MARK }, createdAt: { gte: new Date(sinceMs) }, ...(materialId ? { resource: `StudyMaterial:${materialId}` } : {}) },
      select: { message: true, createdAt: true },
      take: 500,
    });
    return rows.map((r) => ({ at: r.createdAt.getTime(), bytes: Number(/bytes=(\d+)/.exec(r.message)?.[1] ?? 0) }));
  },
  async record(materialId, bytes) {
    const { prisma } = await import("@/lib/prisma");
    await prisma.auditLog.create({ data: { userId: null, action: "USER_UPDATE", resource: `StudyMaterial:${materialId}`, message: `${MARK} bytes=${Math.round(bytes)}` } });
  },
};
