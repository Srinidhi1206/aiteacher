"use server";

// Exam schedules have no school column of their own: a schedule belongs to
// the school of the admin who created it (ExamSchedule.createdByUserId ->
// User.admin.schoolId), the same "owner's school" rule exams and worksheets
// use for their teacher (see requireOwnedAssignment in exams.ts). A board +
// class match alone is never enough - that row is shared by every school on
// the board. There is no UI wired to these actions yet (the admin Exam
// Schedule tab is still local state), but they are real server actions, so
// they are authorized as if there were.
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole, ForbiddenError, UnauthorizedError } from "@/lib/auth/current-session";
import { requireAdminActor } from "./user-management";
import { logAudit } from "@/lib/audit";
import { notifyQuietly, audienceForSchedule } from "@/lib/notifications/core";
import type { ActionResult } from "./materials";

const scheduleInputSchema = z.object({
  name: z.string().trim().min(1).max(200),
  boardId: z.string().min(1),
  schoolClassId: z.string().min(1),
  subjectName: z.string().trim().min(1),
  chapterScope: z.string().trim().min(1),
  examDate: z.string().datetime(),
  durationMinutes: z.number().int().min(1).max(600),
  maxMarks: z.number().int().min(1).max(1000),
  instructions: z.string().trim().max(2000).optional(),
});

/**
 * Loads a schedule only if the acting admin may manage it: a super admin
 * always may; a school admin only when the schedule was created by an admin of
 * their own school. Anything else answers the same as a missing record.
 */
async function loadManageableSchedule(scheduleId: string) {
  const actor = await requireAdminActor();
  const schedule = await prisma.examSchedule.findUnique({
    where: { id: scheduleId },
    include: { createdBy: { select: { admin: { select: { schoolId: true } } } } },
  });
  const ownerSchoolId = schedule?.createdBy?.admin?.schoolId ?? null;
  if (!schedule || !(actor.isSuperAdmin || (actor.schoolId !== null && ownerSchoolId === actor.schoolId))) return null;
  return { actor, schedule };
}

export async function createExamSchedule(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const actor = await requireAdminActor();
    // A schedule belongs to the school of the admin who creates it (that is how students are matched to it), so an
    // administrator without a school - including the super administrator - cannot create one: nobody could ever see it.
    if (!actor.schoolId) {
      return { ok: false, error: "Exam schedules belong to a school. Sign in as a school administrator to schedule an exam." };
    }
    const parsed = scheduleInputSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
    const data = parsed.data;
    // A scheduled exam is an upcoming event; allow a day and a half of slack for timezones.
    if (new Date(data.examDate).getTime() < Date.now() - 36 * 60 * 60 * 1000) return { ok: false, error: "The exam date can't be in the past." };

    // The class must really belong to the chosen board, and a school that
    // already has a board only schedules for that board.
    const schoolClass = await prisma.schoolClass.findUnique({ where: { id: data.schoolClassId } });
    if (!schoolClass || schoolClass.boardId !== data.boardId) return { ok: false, error: "Selected class does not belong to the selected board." };
    if (actor.schoolBoardId && actor.schoolBoardId !== data.boardId) return { ok: false, error: "Selected board does not match your school's board." };

    const schedule = await prisma.examSchedule.create({
      data: { ...data, examDate: new Date(data.examDate), createdByUserId: actor.userId },
    });
    await prisma.auditLog.create({
      data: { userId: actor.userId, action: "EXAM_CREATE", resource: `ExamSchedule:${schedule.id}`, message: `Scheduled "${schedule.name}"` },
    });
    return { ok: true, data: { id: schedule.id } };
  } catch (e) {
    if (e instanceof UnauthorizedError || e instanceof ForbiddenError) return { ok: false, error: e.message };
    throw e;
  }
}

export async function setExamSchedulePublished(scheduleId: string, isPublished: boolean): Promise<ActionResult> {
  try {
    const found = await loadManageableSchedule(scheduleId);
    if (!found) return { ok: false, error: "Exam schedule not found." };
    await prisma.examSchedule.update({ where: { id: scheduleId }, data: { isPublished } });
    await prisma.auditLog.create({
      data: {
        userId: found.actor.userId,
        action: isPublished ? "EXAM_PUBLISH" : "EXAM_UNPUBLISH",
        resource: `ExamSchedule:${scheduleId}`,
        message: `${isPublished ? "Published" : "Unpublished"} exam schedule "${found.schedule.name}"`,
      },
    });
    const ownerSchoolId = found.schedule.createdBy?.admin?.schoolId ?? null;
    if (isPublished && !found.schedule.isPublished && ownerSchoolId) {
      await notifyQuietly(audienceForSchedule({ schoolId: ownerSchoolId, boardId: found.schedule.boardId, schoolClassId: found.schedule.schoolClassId }), {
        type: "EXAM",
        title: "Exam scheduled",
        message: `${found.schedule.name} - ${found.schedule.subjectName} on ${found.schedule.examDate.toISOString().slice(0, 10)}.`,
      });
    }
    return { ok: true };
  } catch (e) {
    if (e instanceof UnauthorizedError || e instanceof ForbiddenError) return { ok: false, error: e.message };
    throw e;
  }
}

export async function deleteExamSchedule(scheduleId: string): Promise<ActionResult> {
  try {
    const found = await loadManageableSchedule(scheduleId);
    if (!found) return { ok: false, error: "Exam schedule not found." };
    await prisma.examSchedule.delete({ where: { id: scheduleId } });
    await logAudit(found.actor.userId, "USER_UPDATE", `ExamSchedule:${scheduleId}`, `Deleted exam schedule "${found.schedule.name}"`);
    return { ok: true };
  } catch (e) {
    if (e instanceof UnauthorizedError || e instanceof ForbiddenError) return { ok: false, error: e.message };
    throw e;
  }
}

export async function listExamSchedulesForAdmin() {
  const actor = await requireAdminActor();
  if (!actor.isSuperAdmin && !actor.schoolId) return [];
  return prisma.examSchedule.findMany({
    where: actor.isSuperAdmin ? {} : { createdBy: { admin: { schoolId: actor.schoolId } } },
    include: { board: true, schoolClass: true },
    orderBy: { examDate: "asc" },
  });
}

/** Published schedules for the logged-in student's own school + board + class only. */
export async function listExamSchedulesForStudent() {
  const session = await requireRole("student");
  const student = await prisma.student.findUnique({ where: { userId: session.id } });
  if (!student?.schoolClassId || !student.schoolId) return [];
  return prisma.examSchedule.findMany({
    where: {
      schoolClassId: student.schoolClassId,
      boardId: student.boardId ?? undefined,
      isPublished: true,
      createdBy: { admin: { schoolId: student.schoolId } },
    },
    orderBy: { examDate: "asc" },
  });
}
