"use server";

// The signed-in student's real calendar, assembled from data that already
// lives in the database - there is no separate calendar table to keep in sync:
//   - exams: published exam schedules of the student's own school + class
//     (created by an admin of that school, see exam-schedule.ts);
//   - assignments: published worksheets of the student's own school + class
//     that have a due date, with this student's own submission state;
//   - study sessions / revision / mock tests: the student's OWN planner tasks
//     and latest study-plan items.
// The student, their school and their class always come from the session's
// own Student row, never from the client, so another school's exam or another
// student's plan can't appear here.
import { prisma } from "@/lib/prisma";
import { requireRole, ForbiddenError } from "@/lib/auth/current-session";
import type { CalendarEvent } from "@/lib/types";

// The planner and study plan store LOCAL midnight (setHours(0,0,0,0)), so they
// are turned back into a date string with local getters; worksheet due dates
// come from a date-only input stored as UTC midnight, so those use the UTC date.
function localDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function utcDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

const KIND_TO_TYPE = {
  TOPIC: "study-session",
  PRACTICE: "study-session",
  BUFFER: "study-session",
  REVISION: "revision",
  MOCK_TEST: "mock-test",
} as const;

export async function getMyCalendarEvents(): Promise<CalendarEvent[]> {
  const session = await requireRole("student");
  const student = await prisma.student.findUnique({
    where: { userId: session.id },
    select: { id: true, schoolId: true, schoolClassId: true, boardId: true },
  });
  if (!student) throw new ForbiddenError("Student profile not found.");

  const events: CalendarEvent[] = [];

  if (student.schoolId && student.schoolClassId) {
    const [schedules, worksheets] = await Promise.all([
      prisma.examSchedule.findMany({
        where: {
          schoolClassId: student.schoolClassId,
          boardId: student.boardId ?? undefined,
          isPublished: true,
          createdBy: { admin: { schoolId: student.schoolId } },
        },
      }),
      prisma.worksheet.findMany({
        where: {
          schoolClassId: student.schoolClassId,
          isPublished: true,
          dueDate: { not: null },
          teacher: { schoolId: student.schoolId },
        },
        include: { subject: { select: { name: true } }, submissions: { where: { studentId: student.id }, select: { submittedAt: true, score: true, maxScore: true } } },
      }),
    ]);

    for (const s of schedules) {
      events.push({
        id: `exam-${s.id}`,
        date: localDate(s.examDate),
        title: s.name,
        subject: s.subjectName,
        type: "exam",
        description: `${s.chapterScope} - ${s.durationMinutes} min - ${s.maxMarks} marks${s.instructions ? ` - ${s.instructions}` : ""}`,
      });
    }
    for (const w of worksheets) {
      const sub = w.submissions[0];
      const state = sub?.score != null ? `Graded ${sub.score}/${sub.maxScore}` : sub?.submittedAt ? "Handed in" : "Not handed in yet";
      events.push({
        id: `assignment-${w.id}`,
        date: utcDate(w.dueDate!),
        title: w.title,
        subject: w.subject.name,
        type: "assignment",
        description: state,
      });
    }
  }

  const [tasks, plan] = await Promise.all([
    prisma.dailyPlannerTask.findMany({ where: { studentId: student.id } }),
    prisma.studyPlan.findFirst({ where: { studentId: student.id }, orderBy: { createdAt: "desc" }, include: { items: true } }),
  ]);

  for (const t of tasks) {
    events.push({
      id: `task-${t.id}`,
      date: localDate(t.date),
      title: t.title,
      subject: t.subject ?? "My plan",
      type: "study-session",
      time: t.time ?? undefined,
      description: t.status === "COMPLETED" ? "Completed" : t.status === "SKIPPED" ? "Skipped" : undefined,
    });
  }
  for (const item of plan?.items ?? []) {
    events.push({
      id: `plan-${item.id}`,
      date: localDate(item.date),
      title: item.title,
      subject: item.subject,
      type: KIND_TO_TYPE[item.kind],
      description: `${item.durationMinutes} min${item.completed ? " - Completed" : ""}`,
    });
  }

  return events.sort((a, b) => a.date.localeCompare(b.date));
}
