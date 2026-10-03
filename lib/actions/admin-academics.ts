"use server";

// Read-only oversight of exams and assignments for administrators. Exams and assignments (worksheets) are authored by
// teachers - an exam or worksheet belongs to its author's school, there is no column of its own - so this lists them by
// the author's school: a school administrator sees their own school's, the super administrator sees every school's, and
// an administrator with no school sees none. Nothing here changes anything; it exists so the people responsible for a
// school can see what is being set for its students.
import { prisma } from "@/lib/prisma";
import { requireAdminActor } from "./user-management";
import { listAuthorableTeachers } from "@/lib/academics/acting";

const MAX_ROWS = 200;

async function scope() {
  const actor = await requireAdminActor();
  if (!actor.isSuperAdmin && !actor.schoolId) return null;
  return actor.isSuperAdmin ? {} : { teacher: { schoolId: actor.schoolId } };
}

export async function listExamsForAdmin() {
  const where = await scope();
  if (where === null) return [];
  const rows = await prisma.exam.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: MAX_ROWS,
    include: {
      schoolClass: { select: { label: true, board: { select: { shortName: true } } } },
      subject: { select: { name: true } },
      teacher: { select: { user: { select: { name: true } }, school: { select: { name: true } } } },
      _count: { select: { questions: true, submissions: true } },
    },
  });
  return rows.map((e) => ({
    id: e.id,
    title: e.title,
    status: e.status,
    maxMarks: e.maxMarks,
    durationMinutes: e.durationMinutes,
    createdAt: e.createdAt,
    className: e.schoolClass.label,
    boardName: e.schoolClass.board.shortName,
    subjectName: e.subject.name,
    teacherName: e.teacher.user.name,
    schoolName: e.teacher.school?.name ?? null,
    questions: e._count.questions,
    submissions: e._count.submissions,
  }));
}

export async function listAssignmentsForAdmin() {
  const where = await scope();
  if (where === null) return [];
  const rows = await prisma.worksheet.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: MAX_ROWS,
    include: {
      schoolClass: { select: { label: true, board: { select: { shortName: true } } } },
      subject: { select: { name: true } },
      chapter: { select: { name: true } },
      teacher: { select: { user: { select: { name: true } }, school: { select: { name: true } } } },
      _count: { select: { submissions: true } },
    },
  });
  return rows.map((w) => ({
    id: w.id,
    title: w.title,
    isPublished: w.isPublished,
    dueDate: w.dueDate,
    createdAt: w.createdAt,
    className: w.schoolClass.label,
    boardName: w.schoolClass.board.shortName,
    subjectName: w.subject.name,
    chapterName: w.chapter?.name ?? null,
    teacherName: w.teacher.user.name,
    schoolName: w.teacher.school?.name ?? null,
    submissions: w._count.submissions,
  }));
}

/** The teachers this administrator may create an exam or assignment for, each with the class + subject pairs they are assigned to. */
export async function listTeachersForAuthoring() {
  const actor = await requireAdminActor();
  return listAuthorableTeachers(prisma, { id: actor.userId, role: "admin" });
}
