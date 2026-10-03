// What is coming up for a TEACHER: the school's published academic-calendar events and the exams the administrator has
// scheduled, limited to their own school and the classes they are assigned to teach. Takes the database handle as a
// parameter (like lib/calendar/core.ts) so the scope can be tested against a real database; the session lookup is in
// lib/actions/teacher-calendar.ts.
import type { prisma } from "@/lib/prisma";
import { teacherAcademicEventWhere } from "@/lib/calendar/scope";

export type TeacherCalendarDb = Pick<typeof prisma, "teacher" | "academicEvent" | "examSchedule">;

export interface TeacherUpcomingItem {
  id: string;
  kind: "event" | "exam";
  title: string;
  /** e.g. "Holiday", "Exam", "School event" - the calendar's own labels. */
  typeLabel: string;
  startDate: Date;
  endDate: Date | null;
  detail: string;
}

const TYPE_LABEL: Record<string, string> = {
  EXAM: "Exam",
  HOLIDAY: "Holiday",
  RESULT: "Results",
  MEETING: "Meeting",
  EVENT: "School event",
  DEADLINE: "Deadline",
  TERM: "Term / Academic year",
  OTHER: "Other",
};

const LIMIT = 8;

export async function listUpcomingForTeacher(db: TeacherCalendarDb, teacherUserId: string, now = new Date()): Promise<TeacherUpcomingItem[]> {
  const teacher = await db.teacher.findUnique({
    where: { userId: teacherUserId },
    select: { schoolId: true, assignments: { select: { schoolClassId: true, schoolClass: { select: { boardId: true } } } } },
  });
  if (!teacher?.schoolId) return [];

  const classes = [...new Map(teacher.assignments.map((a) => [a.schoolClassId, { boardId: a.schoolClass.boardId, schoolClassId: a.schoolClassId }])).values()];
  const startOfToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

  const eventWhere = teacherAcademicEventWhere({ schoolId: teacher.schoolId, classes });
  const [events, exams] = await Promise.all([
    eventWhere
      ? db.academicEvent.findMany({
          // still running (a multi-day holiday that started last week) counts as upcoming until its last day
          where: { AND: [eventWhere, { OR: [{ startDate: { gte: startOfToday } }, { endDate: { gte: startOfToday } }] }] },
          orderBy: { startDate: "asc" },
          take: LIMIT,
          select: { id: true, title: true, type: true, startDate: true, endDate: true, schoolId: true, schoolClass: { select: { label: true } } },
        })
      : Promise.resolve([]),
    classes.length === 0
      ? Promise.resolve([])
      : db.examSchedule.findMany({
          where: {
            isPublished: true,
            examDate: { gte: startOfToday },
            // scheduled by an administrator of THIS school, for a class this teacher teaches
            createdBy: { admin: { schoolId: teacher.schoolId } },
            OR: classes.map((c) => ({ boardId: c.boardId, schoolClassId: c.schoolClassId })),
          },
          orderBy: { examDate: "asc" },
          take: LIMIT,
          select: { id: true, name: true, examDate: true, subjectName: true, schoolClass: { select: { label: true } } },
        }),
  ]);

  const items: TeacherUpcomingItem[] = [
    ...events.map((e) => ({
      id: `event-${e.id}`,
      kind: "event" as const,
      title: e.title,
      typeLabel: TYPE_LABEL[e.type] ?? "Event",
      startDate: e.startDate,
      endDate: e.endDate,
      detail: `${e.schoolClass?.label ?? "All classes"} - ${e.schoolId ? "your school" : "all schools"}`,
    })),
    ...exams.map((x) => ({
      id: `exam-${x.id}`,
      kind: "exam" as const,
      title: x.name,
      typeLabel: "Exam",
      startDate: x.examDate,
      endDate: null,
      detail: `${x.subjectName} - ${x.schoolClass.label}`,
    })),
  ];
  return items.sort((a, b) => a.startDate.getTime() - b.startDate.getTime()).slice(0, LIMIT);
}
