// A cap on how often one textbook may be downloaded in full from file storage. The in-memory cache (lib/rag/pdf-cache.ts) only helps while
// consecutive calls land on the same warm server instance; this budget holds ACROSS instances, so a runaway loop can never repeat the 11 GB
// incident: after a few downloads of the same file, further ones are refused until the window passes.
//
// How it stays correct under concurrency: a download is RESERVED before it starts - the allowance check and the reservation are one atomic step
// (under a database advisory lock in production) - so ten requests arriving at once cannot all pass the check. A reservation counts the book's
// expected size immediately and is released again if nothing was transferred (blocked store, HTTP error, refused from its headers).
// And it fails CLOSED: if the allowance cannot be checked or recorded, the download does not happen (the caller says so and does not retry).
//
// The ledger is an interface so tests can use a fake. The production one stores one plain row per reservation in the existing audit log, so no
// new table is needed.
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

/**
 * Defaults: 10 full downloads of one book per hour, 1 GB per book per day, 2.5 GB per day for the whole project.
 * Sized for a resumable workflow: a 57 MB book read page by page needs about 30 passes; on a warm server most reuse the in-memory copy, and even
 * with none a day's allowance covers a third of them - the rest resume next day from saved progress. A runaway loop is stopped within minutes.
 * (Hobby allows 10 GB of transfer a month; this keeps one bad day from using it all.)
 */
export function defaultBudget(): DownloadBudget {
  return {
    perMaterialPerHour: fromEnv("STORAGE_DOWNLOADS_PER_MATERIAL_PER_HOUR", 10),
    perMaterialPerDayBytes: fromEnv("STORAGE_BYTES_PER_MATERIAL_PER_DAY_MB", 1024) * MB,
    globalPerDayBytes: fromEnv("STORAGE_BYTES_PER_DAY_MB", 2560) * MB,
  };
}

export interface LedgerEntry {
  materialId: string;
  at: number;
  bytes: number;
}

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

export type BudgetRefusal = { ok: false; scope: "material-hour" | "material-day" | "project-day"; retryAfterMs: number };
export type BudgetDecision = { ok: true } | BudgetRefusal;

/** Pure: whether one more download of `materialId` may start, given every reservation of the last day. */
export function decideBudget(day: LedgerEntry[], materialId: string, budget: DownloadBudget, now: number): BudgetDecision {
  const mine = day.filter((e) => e.materialId === materialId);
  const mineHour = mine.filter((e) => e.at > now - HOUR);
  const retry = (list: LedgerEntry[], window: number) => Math.max(1000, Math.min(...list.map((e) => e.at)) + window - now);
  if (mineHour.length >= budget.perMaterialPerHour) return { ok: false, scope: "material-hour", retryAfterMs: retry(mineHour, HOUR) };
  if (mine.reduce((n, e) => n + e.bytes, 0) >= budget.perMaterialPerDayBytes) return { ok: false, scope: "material-day", retryAfterMs: retry(mine, DAY) };
  if (day.reduce((n, e) => n + e.bytes, 0) >= budget.globalPerDayBytes) return { ok: false, scope: "project-day", retryAfterMs: retry(day, DAY) };
  return { ok: true };
}

export type ReserveResult = { ok: true; id: string | null } | BudgetRefusal;

export interface DownloadLedger {
  /**
   * Atomically: decide against the allowance and, if allowed, record a reservation of `expectedBytes`. THROWS if the ledger cannot be used -
   * the caller treats that as "do not download".
   */
  reserve(materialId: string, expectedBytes: number, budget: DownloadBudget, now: number): Promise<ReserveResult>;
  /** Gives a reservation back (nothing was transferred). Best effort: a failure only means the allowance is counted conservatively. */
  release(id: string): Promise<void>;
}

/** An in-memory ledger. `reserve` has no await between reading and writing, so concurrent callers cannot interleave inside it. */
export function createMemoryLedger(): DownloadLedger & { entries: () => LedgerEntry[] } {
  let seq = 0;
  const rows = new Map<string, LedgerEntry>();
  return {
    async reserve(materialId, expectedBytes, budget, now) {
      const day = [...rows.values()].filter((e) => e.at > now - DAY);
      const decision = decideBudget(day, materialId, budget, now);
      if (!decision.ok) return decision;
      const id = `mem${++seq}`;
      rows.set(id, { materialId, at: now, bytes: expectedBytes });
      return { ok: true, id };
    },
    async release(id) {
      rows.delete(id);
    },
    entries: () => [...rows.values()],
  };
}

const MARK = "[pdf-download]";

/** The slice of Prisma the production ledger uses - declared structurally so a test can stand in for the database. */
export interface LedgerTx {
  $executeRaw(strings: TemplateStringsArray, ...values: unknown[]): Promise<unknown>;
  auditLog: {
    findMany(args: unknown): Promise<{ message: string; createdAt: Date; resource: string | null }[]>;
    create(args: unknown): Promise<{ id: string }>;
  };
}
export interface LedgerDb {
  $transaction<T>(fn: (tx: LedgerTx) => Promise<T>, options?: { timeout?: number }): Promise<T>;
  auditLog: { deleteMany(args: unknown): Promise<unknown> };
}

/**
 * The production ledger: one audit-log row per reservation (`[pdf-download] bytes=N`, resource `StudyMaterial:<id>`), decided and written inside
 * ONE transaction holding a global advisory lock, so two instances can never both pass the check for the same last slot.
 */
export function createAuditLogLedger(getDb: () => Promise<LedgerDb>): DownloadLedger {
  return {
    async reserve(materialId, expectedBytes, budget, now) {
      const db = await getDb();
      return db.$transaction(
        async (tx) => {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended('pdf-download-budget', 0))`;
          const rows = await tx.auditLog.findMany({
            where: { action: "USER_UPDATE", message: { startsWith: MARK }, createdAt: { gte: new Date(now - DAY) } },
            select: { message: true, createdAt: true, resource: true },
            orderBy: { createdAt: "desc" },
            take: 5000,
          });
          const day: LedgerEntry[] = rows.map((r) => ({
            materialId: (r.resource ?? "").replace(/^StudyMaterial:/, ""),
            at: r.createdAt.getTime(),
            bytes: Number(/bytes=(\d+)/.exec(r.message)?.[1] ?? 0),
          }));
          const decision = decideBudget(day, materialId, budget, now);
          if (!decision.ok) return decision;
          const row = await tx.auditLog.create({ data: { userId: null, action: "USER_UPDATE", resource: `StudyMaterial:${materialId}`, message: `${MARK} bytes=${Math.round(expectedBytes)}` } });
          return { ok: true as const, id: row.id };
        },
        { timeout: 10_000 },
      );
    },
    async release(id) {
      const db = await getDb();
      await db.auditLog.deleteMany({ where: { id } });
    },
  };
}

/** Prisma is loaded only when the ledger is actually used, so tests never touch a database. */
export const auditLogLedger: DownloadLedger = createAuditLogLedger(async () => {
  const { prisma } = await import("@/lib/prisma");
  return prisma as unknown as LedgerDb;
});
