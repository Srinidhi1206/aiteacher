"use server";

// Step 2 of a calendar import: the administrator has reviewed (and possibly edited) the preview and pressed Confirm. This
// file only decides WHO may call - any administrator, scoped by the same rules as adding an event by hand - and the rules
// themselves live in lib/calendar-import/core.ts so they can be tested against the real database.
import { prisma } from "@/lib/prisma";
import { ForbiddenError, UnauthorizedError } from "@/lib/auth/current-session";
import { confirmCalendarImportCore, findImportDuplicatesCore } from "@/lib/calendar-import/core";
import { dedupeInFlight, stableKey } from "@/lib/calendar-import/inflight";
import { requireAdminActor } from "./user-management";

async function calendarActor() {
  const a = await requireAdminActor();
  return { userId: a.userId, isSuperAdmin: a.isSuperAdmin, schoolId: a.schoolId };
}

type ImportReply = { ok: boolean; error?: string; data?: { created: number; skipped: number } };
// Identical saves that overlap (a double click, a retry sent before the first answer came back) share ONE run, so they cannot create events twice.
// Sequential repeats are covered by the import itself, which skips events that already exist.
const importsInFlight = new Map<string, Promise<ImportReply>>();

export async function confirmCalendarImport(input: unknown): Promise<ImportReply> {
  try {
    const actor = await calendarActor();
    return await dedupeInFlight(importsInFlight, `${actor.userId}:${stableKey(input)}`, async () => {
      const res = await confirmCalendarImportCore(prisma, actor, input);
      return res.ok ? { ok: true, data: { created: res.created, skipped: res.skipped.length } } : { ok: false, error: res.error };
    });
  } catch (e) {
    if (e instanceof UnauthorizedError || e instanceof ForbiddenError) return { ok: false, error: e.message };
    throw e;
  }
}

export async function checkCalendarImportDuplicates(input: {
  scope: { schoolId?: string; boardId?: string; schoolClassId?: string };
  events: { title: string; startDate: string; schoolClassId?: string }[];
}): Promise<{ ok: boolean; error?: string; duplicates?: boolean[] }> {
  try {
    const res = await findImportDuplicatesCore(prisma, await calendarActor(), input);
    return res.ok ? { ok: true, duplicates: res.duplicates } : { ok: false, error: res.error };
  } catch (e) {
    if (e instanceof UnauthorizedError || e instanceof ForbiddenError) return { ok: false, error: e.message };
    throw e;
  }
}
