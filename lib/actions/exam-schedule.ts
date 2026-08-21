"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole, ForbiddenError, UnauthorizedError } from "@/lib/auth/current-session";
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

export async function createExamSchedule(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const session = await requireRole("admin");
    const parsed = scheduleInputSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
    const data = parsed.data;
    const schedule = await prisma.examSchedule.create({
      data: { ...data, examDate: new Date(data.examDate), createdByUserId: session.id },
    });
    await prisma.auditLog.create({
      data: { userId: session.id, action: "EXAM_CREATE", resource: `ExamSchedule:${schedule.id}`, message: `Scheduled "${schedule.name}"` },
    });
    return { ok: true, data: { id: schedule.id } };
  } catch (e) {
    if (e instanceof UnauthorizedError || e instanceof ForbiddenError) return { ok: false, error: e.message };
    throw e;
  }
}

export async function setExamSchedulePublished(scheduleId: string, isPublished: boolean): Promise<ActionResult> {
  try {
    const session = await requireRole("admin");
    await prisma.examSchedule.update({ where: { id: scheduleId }, data: { isPublished } });
    await prisma.auditLog.create({
      data: {
        userId: session.id,
        action: isPublished ? "EXAM_PUBLISH" : "EXAM_UNPUBLISH",
        resource: `ExamSchedule:${scheduleId}`,
        message: `${isPublished ? "Published" : "Unpublished"} exam schedule`,
      },
    });
    return { ok: true };
  } catch (e) {
    if (e instanceof UnauthorizedError || e instanceof ForbiddenError) return { ok: false, error: e.message };
    throw e;
  }
}

export async function deleteExamSchedule(scheduleId: string): Promise<ActionResult> {
  try {
    await requireRole("admin");
    await prisma.examSchedule.delete({ where: { id: scheduleId } });
    return { ok: true };
  } catch (e) {
    if (e instanceof UnauthorizedError || e instanceof ForbiddenError) return { ok: false, error: e.message };
    throw e;
  }
}

export async function listExamSchedulesForAdmin() {
  await requireRole("admin");
  return prisma.examSchedule.findMany({
    include: { board: true, schoolClass: true },
    orderBy: { examDate: "asc" },
  });
}

/** Published schedules matching the logged-in student's own board/class only. */
export async function listExamSchedulesForStudent() {
  const session = await requireRole("student");
  const student = await prisma.student.findUnique({ where: { userId: session.id } });
  if (!student?.schoolClassId) return [];
  return prisma.examSchedule.findMany({
    where: { schoolClassId: student.schoolClassId, boardId: student.boardId ?? undefined, isPublished: true },
    orderBy: { examDate: "asc" },
  });
}
