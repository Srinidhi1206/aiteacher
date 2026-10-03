// Core logic for the administrator-managed academic calendar, kept apart from the server actions
// (lib/actions/academic-calendar.ts) so it takes the database handle as a parameter: the actions pass the real
// client after authenticating, tests pass a transaction they roll back.
//
// Who may do what:
//   - the super administrator creates events of ANY scope (common to a board + class, school-specific, school-wide,
//     or platform-wide) and manages every event;
//   - a school administrator can only create and manage events of THEIR OWN school (school-wide or for one class);
//     the school is forced from their own record, never taken from the request, and they can see - but not change -
//     the common and platform-wide events that reach their students.
// Scope sanity: a class implies its board, so a class that does not belong to the stated board is refused, and so is a
// class or board that the event's school does not teach.
import { z } from "zod";
import { AcademicEventType } from "@prisma/client";
import type { prisma } from "@/lib/prisma";

export type CalendarDb = Pick<typeof prisma, "academicEvent" | "school" | "board" | "schoolClass" | "auditLog">;
export type CoreResult<T = void> = { ok: boolean; error?: string; data?: T };
export interface CalendarActor {
  userId: string;
  isSuperAdmin: boolean;
  /** The administrator's own school (null for the super administrator). */
  schoolId: string | null;
}

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid date.");

export const eventFieldsSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(200),
  type: z.nativeEnum(AcademicEventType),
  startDate: dateStr,
  endDate: dateStr.optional().or(z.literal("")),
  description: z.string().trim().max(2000).optional(),
  academicYear: z.string().trim().regex(/^\d{4}-\d{2}$/, "Academic year looks like 2026-27.").optional().or(z.literal("")),
});

export const eventInputSchema = eventFieldsSchema.extend({
  schoolId: z.string().trim().optional().or(z.literal("")),
  boardId: z.string().trim().optional().or(z.literal("")),
  schoolClassId: z.string().trim().optional().or(z.literal("")),
});

function toDate(s: string): Date {
  return new Date(`${s}T00:00:00.000Z`);
}

function checkDates(startDate: string, endDate?: string): string | null {
  if (Number.isNaN(toDate(startDate).getTime())) return "Use a valid start date.";
  if (endDate) {
    if (Number.isNaN(toDate(endDate).getTime())) return "Use a valid end date.";
    if (endDate < startDate) return "The end date cannot be before the start date.";
  }
  return null;
}

type Scope = { schoolId: string | null; boardId: string | null; schoolClassId: string | null };

async function resolveScope(db: CalendarDb, actor: CalendarActor, input: { schoolId?: string; boardId?: string; schoolClassId?: string }): Promise<{ ok: true; value: Scope } | { ok: false; error: string }> {
  let schoolId = input.schoolId || null;
  let boardId = input.boardId || null;
  const schoolClassId = input.schoolClassId || null;

  if (!actor.isSuperAdmin) {
    if (!actor.schoolId) return { ok: false, error: "Your account is not attached to a school, so there is no school calendar to manage." };
    schoolId = actor.schoolId; // forced: a school administrator can only ever write to their own school
  }

  const school = schoolId ? await db.school.findUnique({ where: { id: schoolId } }) : null;
  if (schoolId && !school) return { ok: false, error: "School not found." };

  if (schoolClassId) {
    const cls = await db.schoolClass.findUnique({ where: { id: schoolClassId } });
    if (!cls) return { ok: false, error: "Class not found." };
    if (boardId && boardId !== cls.boardId) return { ok: false, error: "That class does not belong to the selected board." };
    boardId = cls.boardId; // a class implies its board
  } else if (boardId) {
    const board = await db.board.findUnique({ where: { id: boardId } });
    if (!board) return { ok: false, error: "Board not found." };
  }

  if (school?.boardId && boardId && school.boardId !== boardId) return { ok: false, error: "That school teaches a different board." };
  return { ok: true, value: { schoolId, boardId, schoolClassId } };
}

export function describeScope(s: { school?: { name: string } | null; board?: { shortName: string } | null; schoolClass?: { label: string } | null }): string {
  const who = s.school ? s.school.name : "All schools";
  const board = s.board ? s.board.shortName : s.school ? null : "all boards";
  const cls = s.schoolClass ? s.schoolClass.label : "all classes";
  return [who, board, cls].filter(Boolean).join(" · ");
}

export async function createAcademicEventCore(db: CalendarDb, actor: CalendarActor, input: unknown): Promise<CoreResult<{ id: string }>> {
  const parsed = eventInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  const d = parsed.data;
  const dateProblem = checkDates(d.startDate, d.endDate || undefined);
  if (dateProblem) return { ok: false, error: dateProblem };
  const scope = await resolveScope(db, actor, d);
  if (!scope.ok) return scope;

  const event = await db.academicEvent.create({
    data: {
      title: d.title,
      type: d.type,
      startDate: toDate(d.startDate),
      endDate: d.endDate ? toDate(d.endDate) : null,
      description: d.description || null,
      academicYear: d.academicYear || null,
      isPublished: false, // always starts as a draft; publishing is a deliberate second step
      ...scope.value,
      createdByUserId: actor.userId,
    },
  });
  await db.auditLog.create({
    data: { userId: actor.userId, action: "USER_UPDATE", resource: `AcademicEvent:${event.id}`, message: `Calendar event created: "${event.title}" (${event.type})` },
  });
  return { ok: true, data: { id: event.id } };
}

async function loadManageable(db: CalendarDb, actor: CalendarActor, eventId: string) {
  const event = await db.academicEvent.findUnique({ where: { id: eventId } });
  // Same answer for "missing" and "someone else's", so ids can't be probed.
  if (!event || !(actor.isSuperAdmin || (actor.schoolId !== null && event.schoolId === actor.schoolId))) return null;
  return event;
}

export async function updateAcademicEventCore(db: CalendarDb, actor: CalendarActor, eventId: string, input: unknown): Promise<CoreResult> {
  const parsed = eventFieldsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  const event = await loadManageable(db, actor, eventId);
  if (!event) return { ok: false, error: "Event not found." };
  const d = parsed.data;
  const dateProblem = checkDates(d.startDate, d.endDate || undefined);
  if (dateProblem) return { ok: false, error: dateProblem };

  // Who the event is for is fixed once created; to change the audience, delete it and create a new one.
  await db.academicEvent.update({
    where: { id: eventId },
    data: {
      title: d.title,
      type: d.type,
      startDate: toDate(d.startDate),
      endDate: d.endDate ? toDate(d.endDate) : null,
      description: d.description || null,
      academicYear: d.academicYear || null,
    },
  });
  await db.auditLog.create({ data: { userId: actor.userId, action: "USER_UPDATE", resource: `AcademicEvent:${eventId}`, message: `Calendar event updated: "${d.title}"` } });
  return { ok: true };
}

export async function setAcademicEventPublishedCore(db: CalendarDb, actor: CalendarActor, eventId: string, isPublished: boolean): Promise<CoreResult> {
  const event = await loadManageable(db, actor, eventId);
  if (!event) return { ok: false, error: "Event not found." };
  if (event.isPublished === isPublished) return { ok: true };
  await db.academicEvent.update({ where: { id: eventId }, data: { isPublished } });
  await db.auditLog.create({
    data: { userId: actor.userId, action: "USER_UPDATE", resource: `AcademicEvent:${eventId}`, message: `Calendar event ${isPublished ? "published" : "unpublished"}: "${event.title}"` },
  });
  return { ok: true };
}

export async function deleteAcademicEventCore(db: CalendarDb, actor: CalendarActor, eventId: string): Promise<CoreResult> {
  const event = await loadManageable(db, actor, eventId);
  if (!event) return { ok: false, error: "Event not found." };
  await db.academicEvent.delete({ where: { id: eventId } });
  await db.auditLog.create({ data: { userId: actor.userId, action: "USER_UPDATE", resource: `AcademicEvent:${eventId}`, message: `Calendar event deleted: "${event.title}"` } });
  return { ok: true };
}

/**
 * Events for the admin screen. The super administrator sees all; a school administrator sees their own school's events
 * (editable) plus the common and platform-wide events that reach their students (read-only).
 */
export async function listAcademicEventsCore(db: CalendarDb, actor: CalendarActor) {
  if (!actor.isSuperAdmin && !actor.schoolId) return [];
  // A school administrator also sees the common events that can reach their students: those for every board, or for
  // the board their school teaches - not another board's.
  const school = !actor.isSuperAdmin && actor.schoolId ? await db.school.findUnique({ where: { id: actor.schoolId }, select: { boardId: true } }) : null;
  const rows = await db.academicEvent.findMany({
    where: actor.isSuperAdmin
      ? {}
      : { OR: [{ schoolId: actor.schoolId }, { schoolId: null, ...(school?.boardId ? { OR: [{ boardId: null }, { boardId: school.boardId }] } : {}) }] },
    include: { school: { select: { name: true } }, board: { select: { shortName: true } }, schoolClass: { select: { label: true } } },
    orderBy: [{ startDate: "asc" }, { title: "asc" }],
  });
  return rows.map((r) => ({ ...r, editable: actor.isSuperAdmin || (actor.schoolId !== null && r.schoolId === actor.schoolId), audience: describeScope(r) }));
}
