// Core logic for class timetables, kept apart from the server actions (lib/actions/timetable.ts) so it takes the database
// handle as a parameter: the actions pass the real client after authenticating, tests pass a throwaway database.
//
// Who may do what:
//   - an administrator imports, publishes, replaces and deletes timetables for THEIR OWN school only (the school is forced from
//     their own record, never taken from the request); the super administrator may name any school;
//   - a timetable belongs to one school, one class and optionally one section; the school must teach the class's board;
//   - nothing from an import is saved until an administrator confirms the reviewed preview; everything is validated again here;
//   - one timetable per school + class + section: importing another for the same one is refused unless the administrator
//     explicitly chooses to replace it, and the replace is audit-logged;
//   - students see ONLY their own school's and class's PUBLISHED timetable (their section's, when they are in one).
import { z } from "zod";
import type { prisma } from "@/lib/prisma";
import { isValidTime } from "@/lib/timetable/parts";

export type TimetableDb = Pick<typeof prisma, "timetable" | "timetableEntry" | "school" | "schoolClass" | "schoolClassSubject" | "auditLog" | "classSectionEnrollment" | "$transaction">;
export interface TimetableActor {
  userId: string;
  isSuperAdmin: boolean;
  /** The administrator's own school (null for the super administrator). */
  schoolId: string | null;
}

const time = z.string().refine(isValidTime, "Use a valid time (HH:MM).");

const periodSchema = z
  .object({
    day: z.number().int().min(1, "Choose a day for every period.").max(7),
    period: z.number().int().min(1).max(20).nullish(),
    startTime: time.nullish().or(z.literal("")),
    endTime: time.nullish().or(z.literal("")),
    subject: z.string().trim().min(1, "Every period needs a subject.").max(100),
    teacher: z.string().trim().max(100).nullish().or(z.literal("")),
    room: z.string().trim().max(30).nullish().or(z.literal("")),
  })
  .superRefine((p, ctx) => {
    const start = p.startTime || null;
    const end = p.endTime || null;
    if (!p.period && !start) ctx.addIssue({ code: "custom", message: `"${p.subject}": give a period number or a start time.` });
    if ((start && !end) || (!start && end)) ctx.addIssue({ code: "custom", message: `"${p.subject}": give both the start and the end time, or neither.` });
    if (start && end && end <= start) ctx.addIssue({ code: "custom", message: `"${p.subject}": the end time must be after the start time.` });
  });

const groupSchema = z.object({
  schoolClassId: z.string().trim().min(1, "Choose the class for every timetable."),
  section: z.string().trim().max(10).regex(/^[A-Za-z0-9 -]*$/, "A section is letters or numbers, for example A.").optional().or(z.literal("")),
  title: z.string().trim().max(150).optional().or(z.literal("")),
  academicYear: z.string().trim().regex(/^\d{4}-\d{2}$/, "Academic year looks like 2026-27.").optional().or(z.literal("")),
  replace: z.boolean().optional(),
  periods: z.array(periodSchema).min(1, "A timetable needs at least one period.").max(80, "At most 80 periods per class."),
});

const importSchema = z.object({
  schoolId: z.string().trim().optional().or(z.literal("")),
  publish: z.boolean().optional(),
  sourceName: z.string().trim().max(200).optional(),
  sourceUrl: z.string().trim().max(500).optional(),
  groups: z.array(groupSchema).min(1, "There is nothing to import.").max(30, "At most 30 classes per import."),
});

/** "Section A" / "sec. a" / "A" -> "A". Used both when saving and when matching a student's section. */
export function normalizeSection(s: string | null | undefined): string {
  return (s ?? "").replace(/^\s*(?:section|sec\.?|div\.?|division)\s*/i, "").trim().toUpperCase();
}

export type CoreResult<T = void> = { ok: true; data: T } | { ok: false; error: string };

async function resolveSchool(db: TimetableDb, actor: TimetableActor, requested?: string): Promise<CoreResult<{ id: string; name: string; boardId: string | null }>> {
  let schoolId = requested || null;
  if (!actor.isSuperAdmin) {
    if (!actor.schoolId) return { ok: false, error: "Your account is not attached to a school, so there are no timetables for you to manage." };
    schoolId = actor.schoolId; // forced: a school administrator can only ever write to their own school
  }
  if (!schoolId) return { ok: false, error: "Choose the school this timetable is for." };
  const school = await db.school.findUnique({ where: { id: schoolId }, select: { id: true, name: true, boardId: true, isEnabled: true } });
  if (!school) return { ok: false, error: "School not found." };
  if (!school.isEnabled) return { ok: false, error: "That school is disabled." };
  return { ok: true, data: { id: school.id, name: school.name, boardId: school.boardId } };
}

export interface ImportedTimetable {
  id: string;
  className: string;
  section: string;
  periods: number;
  replaced: boolean;
}

export async function confirmTimetableImportCore(db: TimetableDb, actor: TimetableActor, input: unknown): Promise<CoreResult<{ timetables: ImportedTimetable[] }>> {
  const parsed = importSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid import." };
  const { groups, publish, sourceName, sourceUrl } = parsed.data;

  const school = await resolveSchool(db, actor, parsed.data.schoolId);
  if (!school.ok) return school;

  const seen = new Set<string>();
  const prepared: { classId: string; classLabel: string; section: string; existingId: string | null; group: (typeof groups)[number]; subjectIds: Map<string, string> }[] = [];
  for (const g of groups) {
    const cls = await db.schoolClass.findUnique({ where: { id: g.schoolClassId }, select: { id: true, label: true, boardId: true, board: { select: { shortName: true } } } });
    if (!cls) return { ok: false, error: "A class you chose does not exist." };
    if (school.data.boardId && school.data.boardId !== cls.boardId) return { ok: false, error: `${school.data.name} does not teach ${cls.board.shortName}, so ${cls.label} (${cls.board.shortName}) cannot have a timetable there.` };
    const section = normalizeSection(g.section);
    const key = `${cls.id}|${section}`;
    if (seen.has(key)) return { ok: false, error: `${cls.label}${section ? ` ${section}` : ""} appears twice in this import.` };
    seen.add(key);
    const existing = await db.timetable.findUnique({ where: { schoolId_schoolClassId_section: { schoolId: school.data.id, schoolClassId: cls.id, section } }, select: { id: true } });
    if (existing && !g.replace) return { ok: false, error: `${cls.label}${section ? ` ${section}` : ""} already has a timetable. Choose "Replace the existing timetable" to overwrite it.` };
    const links = await db.schoolClassSubject.findMany({ where: { schoolClassId: cls.id, isEnabled: true }, select: { subject: { select: { id: true, name: true } } } });
    prepared.push({ classId: cls.id, classLabel: cls.label, section, existingId: existing?.id ?? null, group: g, subjectIds: new Map(links.map((l) => [l.subject.name.trim().toLowerCase(), l.subject.id])) });
  }

  const out: ImportedTimetable[] = [];
  await db.$transaction(async (tx) => {
    for (const p of prepared) {
      const entries = p.group.periods.map((e) => ({
        day: e.day,
        period: e.period ?? null,
        startTime: e.startTime || null,
        endTime: e.endTime || null,
        subjectName: e.subject,
        subjectId: p.subjectIds.get(e.subject.trim().toLowerCase()) ?? null,
        teacherName: e.teacher || null,
        room: e.room || null,
      }));
      const base = {
        title: p.group.title || null,
        academicYear: p.group.academicYear || null,
        isPublished: publish === true,
        sourceName: sourceName ?? null,
        sourceUrl: sourceUrl ?? null,
      };
      let id: string;
      if (p.existingId) {
        await tx.timetableEntry.deleteMany({ where: { timetableId: p.existingId } });
        await tx.timetable.update({ where: { id: p.existingId }, data: { ...base, createdByUserId: actor.userId } });
        await tx.timetableEntry.createMany({ data: entries.map((e) => ({ ...e, timetableId: p.existingId! })) });
        id = p.existingId;
      } else {
        const created = await tx.timetable.create({ data: { ...base, schoolId: school.data.id, schoolClassId: p.classId, section: p.section, createdByUserId: actor.userId } });
        await tx.timetableEntry.createMany({ data: entries.map((e) => ({ ...e, timetableId: created.id })) });
        id = created.id;
      }
      await tx.auditLog.create({
        data: {
          userId: actor.userId,
          action: "USER_UPDATE",
          resource: `Timetable:${id}`,
          message: `Timetable ${p.existingId ? "replaced" : "imported"}${sourceName ? ` from "${sourceName}"` : ""}: ${p.classLabel}${p.section ? ` ${p.section}` : ""} at ${school.data.name}, ${entries.length} period${entries.length === 1 ? "" : "s"}, ${publish ? "published" : "saved as a draft"}${sourceUrl ? ` - original document: ${sourceUrl}` : ""}`,
        },
      });
      out.push({ id, className: p.classLabel, section: p.section, periods: entries.length, replaced: !!p.existingId });
    }
  });
  return { ok: true, data: { timetables: out } };
}

async function loadManageable(db: TimetableDb, actor: TimetableActor, id: string) {
  const t = await db.timetable.findUnique({ where: { id }, include: { schoolClass: { select: { label: true } }, school: { select: { name: true } } } });
  // Same answer for "missing" and "another school's", so ids cannot be probed.
  if (!t || !(actor.isSuperAdmin || (actor.schoolId !== null && t.schoolId === actor.schoolId))) return null;
  return t;
}

export async function setTimetablePublishedCore(db: TimetableDb, actor: TimetableActor, id: string, isPublished: boolean): Promise<CoreResult> {
  const t = await loadManageable(db, actor, id);
  if (!t) return { ok: false, error: "Timetable not found." };
  if (t.isPublished === isPublished) return { ok: true, data: undefined };
  await db.timetable.update({ where: { id }, data: { isPublished } });
  await db.auditLog.create({
    data: { userId: actor.userId, action: "USER_UPDATE", resource: `Timetable:${id}`, message: `Timetable ${isPublished ? "published" : "unpublished"}: ${t.schoolClass.label}${t.section ? ` ${t.section}` : ""} at ${t.school.name}` },
  });
  return { ok: true, data: undefined };
}

export async function deleteTimetableCore(db: TimetableDb, actor: TimetableActor, id: string): Promise<CoreResult> {
  const t = await loadManageable(db, actor, id);
  if (!t) return { ok: false, error: "Timetable not found." };
  await db.timetable.delete({ where: { id } });
  await db.auditLog.create({
    data: { userId: actor.userId, action: "USER_UPDATE", resource: `Timetable:${id}`, message: `Timetable deleted: ${t.schoolClass.label}${t.section ? ` ${t.section}` : ""} at ${t.school.name}` },
  });
  return { ok: true, data: undefined };
}

/** Timetables an administrator may see: the super administrator's - all; a school administrator's - their school's. */
export async function listTimetablesCore(db: TimetableDb, actor: TimetableActor) {
  if (!actor.isSuperAdmin && !actor.schoolId) return [];
  const rows = await db.timetable.findMany({
    where: actor.isSuperAdmin ? {} : { schoolId: actor.schoolId! },
    orderBy: [{ school: { name: "asc" } }, { schoolClass: { grade: "asc" } }, { section: "asc" }],
    take: 300,
    include: { school: { select: { name: true } }, schoolClass: { select: { label: true, grade: true, board: { select: { shortName: true } } } }, _count: { select: { entries: true } } },
  });
  return rows.map((t) => ({
    id: t.id,
    schoolId: t.schoolId,
    schoolName: t.school.name,
    schoolClassId: t.schoolClassId,
    className: t.schoolClass.label,
    boardName: t.schoolClass.board.shortName,
    section: t.section,
    title: t.title,
    academicYear: t.academicYear,
    isPublished: t.isPublished,
    periods: t._count.entries,
    sourceName: t.sourceName,
    sourceUrl: t.sourceUrl,
    updatedAt: t.updatedAt,
  }));
}

export interface TimetableEntryView {
  id: string;
  day: number;
  period: number | null;
  startTime: string | null;
  endTime: string | null;
  subjectName: string;
  teacherName: string | null;
  room: string | null;
}

const entrySelect = { id: true, day: true, period: true, startTime: true, endTime: true, subjectName: true, teacherName: true, room: true } as const;
const entryOrder = [{ day: "asc" as const }, { startTime: "asc" as const }, { period: "asc" as const }];

export async function getTimetableCore(db: TimetableDb, actor: TimetableActor, id: string) {
  const t = await loadManageable(db, actor, id);
  if (!t) return null;
  const entries = await db.timetableEntry.findMany({ where: { timetableId: id }, orderBy: entryOrder, select: entrySelect });
  return { id: t.id, schoolName: t.school.name, className: t.schoolClass.label, section: t.section, title: t.title, academicYear: t.academicYear, isPublished: t.isPublished, sourceUrl: t.sourceUrl, entries: entries as TimetableEntryView[] };
}

export interface StudentTimetableScope {
  userId: string;
  schoolId: string | null;
  schoolClassId: string | null;
}

/**
 * The timetable a student sees: their own school's and class's PUBLISHED one. When the class has timetables for sections,
 * the student gets their own section's (from their section enrolment) and otherwise the whole-class one; they never see a
 * section timetable that is not theirs, and a student with no school or class sees nothing.
 */
export async function studentTimetableCore(db: TimetableDb, student: StudentTimetableScope) {
  if (!student.schoolId || !student.schoolClassId) return null;
  const published = await db.timetable.findMany({
    where: { schoolId: student.schoolId, schoolClassId: student.schoolClassId, isPublished: true },
    include: { schoolClass: { select: { label: true } } },
  });
  if (published.length === 0) return null;
  const enrolments = await db.classSectionEnrollment.findMany({
    where: { student: { userId: student.userId }, section: { schoolClassId: student.schoolClassId } },
    select: { section: { select: { name: true } } },
  });
  const mine = new Set(enrolments.map((e) => normalizeSection(e.section.name)).filter(Boolean));
  const chosen = published.find((t) => t.section !== "" && mine.has(t.section)) ?? published.find((t) => t.section === "") ?? null;
  if (!chosen) return null;
  const entries = await db.timetableEntry.findMany({ where: { timetableId: chosen.id }, orderBy: entryOrder, select: entrySelect });
  return { id: chosen.id, className: chosen.schoolClass.label, section: chosen.section, title: chosen.title, academicYear: chosen.academicYear, entries: entries as TimetableEntryView[] };
}
