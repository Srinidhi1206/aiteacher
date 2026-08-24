"use server";

// Daily Planner (Stage E5). DailyPlannerTask rows are student-created
// to-do items, distinct from the system-generated StudyPlanItem (learning
// path) - see the schema comment on DailyPlannerTask.
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole, ForbiddenError, UnauthorizedError } from "@/lib/auth/current-session";
import { PlannerTaskStatus, Priority } from "@prisma/client";
import type { ActionResult } from "./materials";

const taskInputSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(200),
  subject: z.string().trim().max(100).optional(),
  date: z.string().datetime(),
  time: z.string().trim().max(20).optional(),
  priority: z.nativeEnum(Priority).optional(),
});

async function requireOwnStudent() {
  const session = await requireRole("student");
  const student = await prisma.student.findUnique({ where: { userId: session.id } });
  if (!student) throw new ForbiddenError("Student profile not found.");
  return student;
}

export async function createPlannerTask(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const student = await requireOwnStudent();
    const parsed = taskInputSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
    const data = parsed.data;
    const task = await prisma.dailyPlannerTask.create({
      data: {
        studentId: student.id,
        title: data.title,
        subject: data.subject,
        date: new Date(data.date),
        time: data.time,
        priority: data.priority ?? "MEDIUM",
      },
    });
    return { ok: true, data: { id: task.id } };
  } catch (e) {
    if (e instanceof UnauthorizedError || e instanceof ForbiddenError) return { ok: false, error: e.message };
    throw e;
  }
}

export async function setPlannerTaskStatus(taskId: string, status: PlannerTaskStatus): Promise<ActionResult> {
  try {
    const student = await requireOwnStudent();
    const task = await prisma.dailyPlannerTask.findUnique({ where: { id: taskId } });
    if (!task || task.studentId !== student.id) return { ok: false, error: "Task not found." };
    await prisma.dailyPlannerTask.update({ where: { id: taskId }, data: { status } });
    return { ok: true };
  } catch (e) {
    if (e instanceof UnauthorizedError || e instanceof ForbiddenError) return { ok: false, error: e.message };
    throw e;
  }
}

export async function deletePlannerTask(taskId: string): Promise<ActionResult> {
  try {
    const student = await requireOwnStudent();
    const task = await prisma.dailyPlannerTask.findUnique({ where: { id: taskId } });
    if (!task || task.studentId !== student.id) return { ok: false, error: "Task not found." };
    await prisma.dailyPlannerTask.delete({ where: { id: taskId } });
    return { ok: true };
  } catch (e) {
    if (e instanceof UnauthorizedError || e instanceof ForbiddenError) return { ok: false, error: e.message };
    throw e;
  }
}

/** Everything the dashboard's "Today's Planner" widget needs in one call: manual tasks, today's learning-path item, worksheets due soon, and upcoming exams. */
export async function getTodayOverview() {
  const student = await requireOwnStudent();
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const endOfToday = new Date(startOfToday);
  endOfToday.setDate(endOfToday.getDate() + 1);

  const [tasks, planItem, dueWorksheets, upcomingExams] = await Promise.all([
    prisma.dailyPlannerTask.findMany({
      where: { studentId: student.id, date: { gte: startOfToday, lt: endOfToday } },
      orderBy: { time: "asc" },
    }),
    prisma.studyPlanItem.findFirst({
      where: { studyPlan: { studentId: student.id }, date: { gte: startOfToday, lt: endOfToday } },
    }),
    student.schoolClassId
      ? prisma.worksheet.findMany({
          where: {
            schoolClassId: student.schoolClassId,
            isPublished: true,
            dueDate: { gte: startOfToday, lt: new Date(startOfToday.getTime() + 7 * 86_400_000) },
            submissions: { none: { studentId: student.id } },
          },
          include: { subject: true },
          orderBy: { dueDate: "asc" },
          take: 5,
        })
      : Promise.resolve([]),
    student.schoolClassId
      ? prisma.examSchedule.findMany({
          where: { schoolClassId: student.schoolClassId, isPublished: true, examDate: { gte: startOfToday } },
          orderBy: { examDate: "asc" },
          take: 3,
        })
      : Promise.resolve([]),
  ]);

  return { tasks, planItem, dueWorksheets, upcomingExams };
}

export interface PlannerAnalyticsBucket {
  total: number;
  completed: number;
  skipped: number;
  remaining: number; // TODO + IN_PROGRESS
  completionPct: number | null; // null when there are no tasks in the window at all
}

/**
 * Real completion stats for the Daily Planner (Stage H). "Today" and "this
 * week" both use the same server-local date convention as
 * getTodayOverview() above (new Date() + setHours(0,0,0,0)) - see
 * docs/STEP_3_5.md's Stage H date-convention note. "This week" is a
 * rolling 7-day window ending today (today - 6 days .. today), not a
 * Monday-Sunday calendar week - simpler and avoids a week-boundary edge
 * case with no real benefit here.
 */
export async function getPlannerAnalytics(): Promise<{ today: PlannerAnalyticsBucket; week: PlannerAnalyticsBucket }> {
  const student = await requireOwnStudent();

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const endOfToday = new Date(startOfToday);
  endOfToday.setDate(endOfToday.getDate() + 1);
  const startOfWeek = new Date(startOfToday);
  startOfWeek.setDate(startOfWeek.getDate() - 6);

  const [todayTasks, weekTasks] = await Promise.all([
    prisma.dailyPlannerTask.findMany({
      where: { studentId: student.id, date: { gte: startOfToday, lt: endOfToday } },
      select: { status: true },
    }),
    prisma.dailyPlannerTask.findMany({
      where: { studentId: student.id, date: { gte: startOfWeek, lt: endOfToday } },
      select: { status: true },
    }),
  ]);

  function bucket(tasks: { status: PlannerTaskStatus }[]): PlannerAnalyticsBucket {
    const completed = tasks.filter((t) => t.status === "COMPLETED").length;
    const skipped = tasks.filter((t) => t.status === "SKIPPED").length;
    const remaining = tasks.length - completed - skipped;
    return {
      total: tasks.length,
      completed,
      skipped,
      remaining,
      completionPct: tasks.length > 0 ? Math.round((completed / tasks.length) * 100) : null,
    };
  }

  return { today: bucket(todayTasks), week: bucket(weekTasks) };
}
