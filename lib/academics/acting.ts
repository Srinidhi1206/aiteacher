// Who may author or manage an exam / assignment (worksheet), and in whose name. Kept apart from the server actions so the
// rules take the database handle as a parameter and can be tested against a real database.
//
// An exam or worksheet always belongs to a TEACHER (Exam.teacherId / Worksheet.teacherId are required, and its school is
// that teacher's school). An administrator may create and manage one ON BEHALF OF an existing teacher:
//   - the teacher must belong to the administrator's own school (the super administrator may act for any school);
//   - for a new exam / assignment the teacher must really be assigned to that class + subject (TeacherAssignment) -
//     exactly the rule a teacher is held to for their own work;
//   - the teacher stays the author in the data; the audit log records the administrator as the actor and names the
//     teacher (see `actingNote`), so "who did it" is never blurred.
// A teacher can still only touch their own; nobody else (student, no session) can do any of it.
import type { prisma } from "@/lib/prisma";

export type ActingDb = Pick<typeof prisma, "admin" | "teacher" | "teacherAssignment">;
export interface ActingSession {
  id: string;
  role: string;
}

export interface AuthorRef {
  id: string; // Teacher.id
  userId: string;
  schoolId: string;
  name: string;
}

export type AuthorResult = { ok: true; teacher: AuthorRef; byAdmin: boolean } | { ok: false; error: string };

async function adminOf(db: ActingDb, session: ActingSession) {
  if (session.role !== "admin") return null;
  return db.admin.findUnique({ where: { userId: session.id }, select: { isSuperAdmin: true, schoolId: true } });
}

/**
 * Resolves whose exam/assignment this will be. A teacher authors their own (and may not name someone else); an
 * administrator must name a teacher of their school who is assigned to the class + subject.
 */
export async function resolveAuthor(
  db: ActingDb,
  session: ActingSession,
  input: { schoolClassId: string; subjectId: string; teacherId?: string }
): Promise<AuthorResult> {
  let teacherRow: { id: string; userId: string; schoolId: string | null; user: { name: string } } | null;
  let byAdmin = false;

  if (session.role === "teacher") {
    teacherRow = await db.teacher.findUnique({ where: { userId: session.id }, select: { id: true, userId: true, schoolId: true, user: { select: { name: true } } } });
    if (!teacherRow) return { ok: false, error: "Teacher profile not found." };
    if (input.teacherId && input.teacherId !== teacherRow.id) return { ok: false, error: "You can only create work in your own name." };
    if (!teacherRow.schoolId) return { ok: false, error: "Your account isn't associated with a school yet. Contact a school administrator." };
  } else if (session.role === "admin") {
    byAdmin = true;
    const admin = await adminOf(db, session);
    if (!admin) return { ok: false, error: "Administrator profile not found." };
    if (!admin.isSuperAdmin && !admin.schoolId) return { ok: false, error: "Your account isn't associated with a school yet." };
    if (!input.teacherId) return { ok: false, error: "Choose the teacher this is being created for." };
    teacherRow = await db.teacher.findUnique({ where: { id: input.teacherId }, select: { id: true, userId: true, schoolId: true, user: { select: { name: true } } } });
    // The same message for "no such teacher" and "a teacher of another school" - an administrator cannot probe other schools.
    if (!teacherRow || !teacherRow.schoolId || (!admin.isSuperAdmin && teacherRow.schoolId !== admin.schoolId)) return { ok: false, error: "Teacher not found." };
  } else {
    return { ok: false, error: "Only teachers and administrators can create exams and assignments." };
  }

  const assigned = await db.teacherAssignment.findFirst({ where: { teacherId: teacherRow.id, schoolClassId: input.schoolClassId, subjectId: input.subjectId }, select: { id: true } });
  if (!assigned) return { ok: false, error: byAdmin ? "That teacher is not assigned to this class and subject." : "You are not assigned to this class/subject." };

  return { ok: true, byAdmin, teacher: { id: teacherRow.id, userId: teacherRow.userId, schoolId: teacherRow.schoolId!, name: teacherRow.user.name } };
}

/**
 * May this session manage (edit, publish, delete, grade) something authored by `author`? The author themself, an
 * administrator of the author's school, or the super administrator.
 */
export async function canManageAuthored(db: ActingDb, session: ActingSession, author: { userId: string; schoolId: string | null }): Promise<boolean> {
  if (session.role === "teacher") return author.userId === session.id;
  if (session.role === "admin") {
    const admin = await adminOf(db, session);
    if (!admin) return false;
    return admin.isSuperAdmin || (admin.schoolId !== null && admin.schoolId === author.schoolId);
  }
  return false;
}

/** Appended to an audit message when an administrator did it, so the log says who acted and for whom. */
export function actingNote(session: ActingSession, authorName: string): string {
  return session.role === "admin" ? ` [done by an administrator on behalf of teacher ${authorName}]` : "";
}

/** The teachers an administrator may create work for (their school's; every school's for the super administrator), with the class + subject pairs each one is assigned to. */
export async function listAuthorableTeachers(db: Pick<typeof prisma, "admin" | "teacher">, session: ActingSession) {
  const admin = await adminOf(db as ActingDb, session);
  if (!admin || (!admin.isSuperAdmin && !admin.schoolId)) return [];
  const rows = await db.teacher.findMany({
    where: { schoolId: admin.isSuperAdmin ? { not: null } : admin.schoolId, user: { status: "ACTIVE" } },
    select: {
      id: true,
      user: { select: { name: true } },
      school: { select: { name: true } },
      assignments: { select: { schoolClassId: true, subjectId: true, schoolClass: { select: { label: true, grade: true, board: { select: { shortName: true } } } }, subject: { select: { name: true } } } },
    },
    orderBy: [{ school: { name: "asc" } }, { user: { name: "asc" } }],
    take: 500,
  });
  return rows.map((t) => ({
    id: t.id,
    name: t.user.name,
    schoolName: t.school?.name ?? null,
    assignments: t.assignments
      .slice()
      .sort((a, b) => a.schoolClass.grade - b.schoolClass.grade || a.subject.name.localeCompare(b.subject.name))
      .map((a) => ({ schoolClassId: a.schoolClassId, subjectId: a.subjectId, schoolClass: { label: `${a.schoolClass.label} (${a.schoolClass.board.shortName})` }, subject: { name: a.subject.name } })),
  }));
}
