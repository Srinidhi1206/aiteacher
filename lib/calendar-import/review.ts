// The decisions of the calendar-import review screen, kept apart from the React component so they can be tested without a browser:
// which rows can be saved, which need correction (and why), what the main button says and whether it is enabled, and the save itself -
// a failed save leaves every row exactly as it was, so the administrator can retry without reading the document again.
// "Saving" here means creating the events as DRAFTS (nothing is published - that is a separate step on the calendar screen).
import type { PreviewEvent } from "./types";

export interface ReviewRow extends PreviewEvent {
  include: boolean;
  /** "" = the audience chosen for the whole import. */
  schoolClassId: string;
  /** Saved as a draft calendar event already (or it already existed); it cannot be saved again from this screen. */
  saved?: boolean;
}

export interface ReviewScope {
  schoolId: string;
  boardId: string;
  schoolClassId: string;
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** A date that really exists ("2026-02-31" is not one). */
export function isRealIsoDate(s: string): boolean {
  if (!ISO.test(s)) return false;
  const d = new Date(`${s}T00:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** Why a row cannot be saved as it stands, in words for the administrator; null when it is fine. */
export function rowProblem(r: Pick<PreviewEvent, "title" | "startDate" | "endDate">): string | null {
  if (!r.title.trim()) return "Needs a title";
  if (!isRealIsoDate(r.startDate)) return "Needs a valid start date";
  if (r.endDate && (!isRealIsoDate(r.endDate) || r.endDate < r.startDate)) return "End date is before the start date";
  return null;
}

/**
 * Whether a row's tick box is locked. A row with a problem cannot be TICKED until it is fixed, but if it is already ticked it can always be UNticked
 * (otherwise the screen would say "fix it or untick it" while offering no way to untick). Saved rows, rows that already exist, and everything while a save
 * is running are locked.
 */
export function tickLocked(r: ReviewRow, opts: { saving: boolean; duplicate: boolean }): boolean {
  return opts.saving || r.saved === true || opts.duplicate || (rowProblem(r) !== null && !r.include);
}

export interface SavePlan {
  /** Ticked, valid, not yet saved and not already in the calendar: what the next save will create. */
  toSave: ReviewRow[];
  /** Ticked but not saveable as they stand - left out of the save and listed with the reason, never dropped silently. */
  blocked: { row: ReviewRow; problem: string }[];
}

export function planSave(rows: ReviewRow[], duplicates: Record<string, boolean>): SavePlan {
  const toSave: ReviewRow[] = [];
  const blocked: SavePlan["blocked"] = [];
  for (const row of rows) {
    if (!row.include || row.saved || duplicates[row.id]) continue;
    const problem = rowProblem(row);
    if (problem) blocked.push({ row, problem });
    else toSave.push(row);
  }
  return { toSave, blocked };
}

/** Extracted events that exist nowhere yet (not saved, not already in the calendar): what would be lost if the screen were closed now. */
export function unsavedCount(rows: ReviewRow[], duplicates: Record<string, boolean>): number {
  return rows.filter((r) => !r.saved && !duplicates[r.id]).length;
}

/** With no school, board or class chosen, a super administrator's events would reach every student on the platform once published. */
export function audienceNeedsAck(isSuperAdmin: boolean, scope: ReviewScope): boolean {
  return isSuperAdmin && !scope.schoolId && !scope.boardId && !scope.schoolClassId;
}

export interface SaveButtonState {
  enabled: boolean;
  label: string;
  /** Why the button is disabled (shown next to it), or null. */
  hint: string | null;
}

export function saveButtonState(plan: SavePlan, opts: { saving: boolean; audienceAcknowledged: boolean; audienceNeedsAck: boolean }): SaveButtonState {
  const n = plan.toSave.length;
  const label = opts.saving ? "Saving..." : n === 0 ? "Save as drafts" : `Save ${n} event${n === 1 ? "" : "s"} as draft${n === 1 ? "" : "s"}`;
  if (opts.saving) return { enabled: false, label, hint: null };
  if (n === 0) return { enabled: false, label, hint: plan.blocked.length > 0 ? "Fix the events marked below, or untick them, to save the rest." : "Tick the events you want to save." };
  if (opts.audienceNeedsAck && !opts.audienceAcknowledged) return { enabled: false, label, hint: "Choose a school, board or class above - or confirm that these drafts are meant for everyone." };
  return { enabled: true, label, hint: null };
}

export interface ImportPayload {
  scope: ReviewScope;
  sourceName?: string;
  sourceUrl?: string;
  events: { title: string; type: PreviewEvent["type"]; startDate: string; endDate: string; description: string; academicYear: string; schoolClassId: string }[];
}

export function buildPayload(rows: ReviewRow[], scope: ReviewScope, source: { sourceName?: string; sourceUrl?: string | null }): ImportPayload {
  return {
    scope,
    sourceName: source.sourceName,
    sourceUrl: source.sourceUrl ?? undefined,
    events: rows.map((r) => ({ title: r.title, type: r.type, startDate: r.startDate, endDate: r.endDate, description: r.description, academicYear: r.academicYear, schoolClassId: r.schoolClassId })),
  };
}

export type SaveOutcome =
  | { status: "saved"; created: number; skipped: number; rows: ReviewRow[]; leftOut: number }
  | { status: "failed"; error: string; rows: ReviewRow[] };

export const SAVE_FAILED_MESSAGE = "The events could not be saved just now. Everything you extracted is still here - check your connection and try again; the document does not need to be read again.";

/**
 * Saves the ticked, valid rows as drafts. `save` is the server call; it may fail or throw. In EVERY failure the returned rows are the rows that
 * were passed in, untouched, so nothing extracted or edited is lost and a retry is a plain second click. On success the rows that were sent are
 * marked saved (and unticked); the others stay for review.
 */
export async function saveDraftRows(args: {
  rows: ReviewRow[];
  duplicates: Record<string, boolean>;
  scope: ReviewScope;
  source: { sourceName?: string; sourceUrl?: string | null };
  save: (payload: ImportPayload) => Promise<{ ok: boolean; error?: string; data?: { created: number; skipped: number } }>;
}): Promise<SaveOutcome> {
  const plan = planSave(args.rows, args.duplicates);
  if (plan.toSave.length === 0) return { status: "failed", error: "There is nothing ticked that can be saved yet.", rows: args.rows };
  let res: Awaited<ReturnType<typeof args.save>>;
  try {
    res = await args.save(buildPayload(plan.toSave, args.scope, args.source));
  } catch {
    return { status: "failed", error: SAVE_FAILED_MESSAGE, rows: args.rows };
  }
  if (!res.ok || !res.data) return { status: "failed", error: res.error ?? SAVE_FAILED_MESSAGE, rows: args.rows };
  const sent = new Set(plan.toSave.map((r) => r.id));
  return {
    status: "saved",
    created: res.data.created,
    skipped: res.data.skipped,
    leftOut: plan.blocked.length,
    rows: args.rows.map((r) => (sent.has(r.id) ? { ...r, saved: true, include: false } : r)),
  };
}
