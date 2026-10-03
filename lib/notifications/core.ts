// Student notifications, built on the existing Notification table (no schema change). A notification is written, one row
// per student, at the moment something relevant is PUBLISHED - so the bell is a plain list with an unread count, with no
// background job and nothing to recompute. Who counts as "relevant" is the same audience rule as visibility:
//   - a study material      -> students of its board + class, in its school (a common material has no school, so every
//                              school's students on that board + class - but only students already placed in a school,
//                              because a student without a school sees no materials yet);
//   - an assignment / exam  -> students of that class in the author's school;
//   - an exam schedule      -> students of that board + class in the scheduling admin's school;
//   - a graded exam or assignment -> that one student;
//   - a student handing in an assignment / exam -> the one teacher who set it;
//   - a registration waiting for approval -> the administrators who may approve it (the super administrators, plus the
//                              administrators of the school the applicant named).
// Only ACTIVE students are notified. Fan-out is capped, and a failure here must never fail the publish that triggered it
// (callers use notifyQuietly).
import type { NotificationType, Prisma } from "@prisma/client";
import type { prisma } from "@/lib/prisma";
import { prisma as client } from "@/lib/prisma";

export type NotifyDb = Pick<typeof prisma, "student" | "admin" | "notification">;
export interface NotificationContent {
  type: NotificationType;
  title: string;
  message: string;
}

const MAX_RECIPIENTS = 5000;

export function audienceForMaterial(m: { schoolId: string | null; boardId: string; schoolClassId: string }): Prisma.StudentWhereInput {
  return { boardId: m.boardId, schoolClassId: m.schoolClassId, schoolId: m.schoolId ?? { not: null } };
}

export function audienceForClassInSchool(a: { schoolId: string; schoolClassId: string }): Prisma.StudentWhereInput {
  return { schoolId: a.schoolId, schoolClassId: a.schoolClassId };
}

export function audienceForSchedule(a: { schoolId: string; boardId: string; schoolClassId: string }): Prisma.StudentWhereInput {
  return { schoolId: a.schoolId, boardId: a.boardId, schoolClassId: a.schoolClassId };
}

/** Writes one notification per matching ACTIVE student; returns how many were written. */
export async function notifyStudents(db: NotifyDb, audience: Prisma.StudentWhereInput, content: NotificationContent): Promise<number> {
  const students = await db.student.findMany({
    where: { ...audience, user: { status: "ACTIVE" } },
    select: { userId: true },
    take: MAX_RECIPIENTS,
  });
  if (students.length === 0) return 0;
  const res = await db.notification.createMany({
    data: students.map((s) => ({ userId: s.userId, type: content.type, title: content.title.slice(0, 120), message: content.message.slice(0, 400) })),
  });
  return res.count;
}

/**
 * Notifies the ACTIVE administrators who may act on something: every super administrator, plus - unless `superOnly` -
 * the administrators of `schoolId`. A school administrator is never told about another school's business.
 */
export async function notifyAdmins(
  db: NotifyDb,
  scope: { schoolId?: string | null; superOnly?: boolean },
  content: NotificationContent
): Promise<number> {
  const admins = await db.admin.findMany({
    where: {
      user: { status: "ACTIVE" },
      OR: [{ isSuperAdmin: true }, ...(!scope.superOnly && scope.schoolId ? [{ schoolId: scope.schoolId }] : [])],
    },
    select: { userId: true },
    take: 200,
  });
  if (admins.length === 0) return 0;
  const res = await db.notification.createMany({
    data: admins.map((a) => ({ userId: a.userId, type: content.type, title: content.title.slice(0, 120), message: content.message.slice(0, 400) })),
  });
  return res.count;
}

export async function notifyUser(db: NotifyDb, userId: string, content: NotificationContent): Promise<void> {
  await db.notification.create({ data: { userId, type: content.type, title: content.title.slice(0, 120), message: content.message.slice(0, 400) } });
}

/** For action code: notifies with the real client and swallows any error - publishing succeeded either way. */
export async function notifyQuietly(audience: Prisma.StudentWhereInput, content: NotificationContent): Promise<void> {
  try {
    await notifyStudents(client, audience, content);
  } catch (err) {
    console.error("[notifications] could not notify", (err as Error)?.name);
  }
}

export async function notifyAdminsQuietly(scope: { schoolId?: string | null; superOnly?: boolean }, content: NotificationContent): Promise<void> {
  try {
    await notifyAdmins(client, scope, content);
  } catch (err) {
    console.error("[notifications] could not notify", (err as Error)?.name);
  }
}

export async function notifyUserQuietly(userId: string, content: NotificationContent): Promise<void> {
  try {
    await notifyUser(client, userId, content);
  } catch (err) {
    console.error("[notifications] could not notify", (err as Error)?.name);
  }
}
