// Confirming a calendar import: the ONLY place an import becomes real calendar events, and only after an administrator
// has reviewed the preview and pressed Confirm. Takes the database handle as a parameter (like lib/calendar/core.ts) so the
// rules can be tested against a real database.
//
//   - Who may import, and for which audience, is exactly who may add an event by hand: the same scope rules
//     (lib/calendar/core.ts resolveScope) - a school administrator can only import into THEIR OWN school, the super
//     administrator into any audience. The school is never taken from the request for a school administrator.
//   - Everything is validated again here; the preview the browser holds is not trusted.
//   - Events are created as DRAFTS (like a manually added event); publishing stays a deliberate second step, which is also
//     what notifies students.
//   - An event that already exists for the same audience (same start day and same title words) is skipped, so importing the
//     same calendar twice adds nothing the second time.
//   - One audit entry records the import: who, the source file, what was created and skipped, and for whom.
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { describeScope, eventFieldsSchema, isRealDate, resolveScope, toDate, type CalendarActor, type CalendarDb, type Scope } from "@/lib/calendar/core";
import { eventKey } from "@/lib/calendar-import/normalize";
import { MAX_EVENTS } from "@/lib/calendar-import/extract";

const importEventSchema = eventFieldsSchema.extend({ schoolClassId: z.string().trim().optional().or(z.literal("")) });
const importSchema = z.object({
  scope: z.object({ schoolId: z.string().trim().optional().or(z.literal("")), boardId: z.string().trim().optional().or(z.literal("")), schoolClassId: z.string().trim().optional().or(z.literal("")) }),
  sourceName: z.string().trim().max(200).optional(),
  sourceUrl: z.string().trim().max(500).optional(),
  events: z.array(importEventSchema).min(1, "There are no events to import.").max(MAX_EVENTS, `At most ${MAX_EVENTS} events can be imported at once.`),
});

export type ImportResult = { ok: true; created: number; skipped: { title: string; startDate: string }[] } | { ok: false; error: string };

const scopeKey = (s: Scope) => `${s.schoolId ?? "-"}|${s.boardId ?? "-"}|${s.schoolClassId ?? "-"}`;

async function resolveAll(db: CalendarDb, actor: CalendarActor, scope: { schoolId?: string; boardId?: string; schoolClassId?: string }, perEvent: (string | undefined)[]) {
  const base = await resolveScope(db, actor, scope);
  if (!base.ok) return { ok: false as const, error: base.error };
  const cache = new Map<string, Scope>();
  const scopes: Scope[] = [];
  for (let i = 0; i < perEvent.length; i++) {
    const override = perEvent[i];
    if (!override || override === base.value.schoolClassId) {
      scopes.push(base.value);
      continue;
    }
    if (!cache.has(override)) {
      const r = await resolveScope(db, actor, { schoolId: base.value.schoolId ?? "", boardId: base.value.boardId ?? "", schoolClassId: override });
      if (!r.ok) return { ok: false as const, error: `Row ${i + 1}: ${r.error}` };
      cache.set(override, r.value);
    }
    scopes.push(cache.get(override)!);
  }
  return { ok: true as const, base: base.value, scopes };
}

async function existingKeys(db: CalendarDb, scopes: Scope[], dates: string[]): Promise<Set<string>> {
  const out = new Set<string>();
  if (dates.length === 0) return out;
  const min = toDate([...dates].sort()[0]);
  const max = toDate([...dates].sort().slice(-1)[0]);
  const distinct = [...new Map(scopes.map((s) => [scopeKey(s), s])).values()];
  const rows = await db.academicEvent.findMany({
    where: { startDate: { gte: min, lte: max }, OR: distinct.map((s): Prisma.AcademicEventWhereInput => ({ schoolId: s.schoolId, boardId: s.boardId, schoolClassId: s.schoolClassId })) },
    select: { title: true, startDate: true, schoolId: true, boardId: true, schoolClassId: true },
  });
  for (const r of rows) out.add(`${scopeKey(r)}#${eventKey({ title: r.title, startDate: r.startDate.toISOString().slice(0, 10) })}`);
  return out;
}

/** For the preview: which of these rows already exist for the chosen audience. Same authorization as the import itself. */
export async function findImportDuplicatesCore(
  db: CalendarDb,
  actor: CalendarActor,
  input: { scope: { schoolId?: string; boardId?: string; schoolClassId?: string }; events: { title: string; startDate: string; schoolClassId?: string }[] }
): Promise<{ ok: true; duplicates: boolean[] } | { ok: false; error: string }> {
  if (input.events.length > MAX_EVENTS) return { ok: false, error: `At most ${MAX_EVENTS} events can be checked at once.` };
  const resolved = await resolveAll(db, actor, input.scope, input.events.map((e) => e.schoolClassId));
  if (!resolved.ok) return resolved;
  const dated = input.events.map((e) => (/^\d{4}-\d{2}-\d{2}$/.test(e.startDate) ? e.startDate : null));
  const have = await existingKeys(db, resolved.scopes, dated.filter((d): d is string => d !== null));
  return { ok: true, duplicates: input.events.map((e, i) => dated[i] !== null && have.has(`${scopeKey(resolved.scopes[i])}#${eventKey({ title: e.title, startDate: dated[i]! })}`)) };
}

export async function confirmCalendarImportCore(db: CalendarDb, actor: CalendarActor, input: unknown): Promise<ImportResult> {
  const parsed = importSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid import." };
  const { scope, events, sourceName, sourceUrl } = parsed.data;

  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    if (e.endDate && e.endDate < e.startDate) return { ok: false, error: `Row ${i + 1}: the end date is before the start date.` };
    if (!isRealDate(e.startDate) || (e.endDate && !isRealDate(e.endDate))) return { ok: false, error: `Row ${i + 1}: use valid dates.` };
  }

  const resolved = await resolveAll(db, actor, scope, events.map((e) => e.schoolClassId || undefined));
  if (!resolved.ok) return resolved;

  const have = await existingKeys(db, resolved.scopes, events.map((e) => e.startDate));
  const toCreate: Prisma.AcademicEventCreateManyInput[] = [];
  const skipped: { title: string; startDate: string }[] = [];
  const inBatch = new Set<string>();
  events.forEach((e, i) => {
    const key = `${scopeKey(resolved.scopes[i])}#${eventKey({ title: e.title, startDate: e.startDate })}`;
    if (have.has(key) || inBatch.has(key)) {
      skipped.push({ title: e.title, startDate: e.startDate });
      return;
    }
    inBatch.add(key);
    toCreate.push({
      title: e.title,
      type: e.type,
      startDate: toDate(e.startDate),
      endDate: e.endDate ? toDate(e.endDate) : null,
      description: e.description || null,
      academicYear: e.academicYear || null,
      isPublished: false, // an import never publishes on its own
      ...resolved.scopes[i],
      createdByUserId: actor.userId,
    });
  });

  if (toCreate.length > 0) await db.academicEvent.createMany({ data: toCreate });

  const [school, board, schoolClass] = await Promise.all([
    resolved.base.schoolId ? db.school.findUnique({ where: { id: resolved.base.schoolId }, select: { name: true } }) : null,
    resolved.base.boardId ? db.board.findUnique({ where: { id: resolved.base.boardId }, select: { shortName: true } }) : null,
    resolved.base.schoolClassId ? db.schoolClass.findUnique({ where: { id: resolved.base.schoolClassId }, select: { label: true } }) : null,
  ]);
  await db.auditLog.create({
    data: {
      userId: actor.userId,
      action: "USER_UPDATE",
      resource: "AcademicEventImport",
      message: `Calendar imported${sourceName ? ` from "${sourceName}"` : ""}: ${toCreate.length} event${toCreate.length === 1 ? "" : "s"} created as drafts, ${skipped.length} already existed and ${skipped.length === 1 ? "was" : "were"} skipped (audience: ${describeScope({ school, board, schoolClass })})${sourceUrl ? ` - original document: ${sourceUrl}` : ""}`,
    },
  });
  return { ok: true, created: toCreate.length, skipped };
}
