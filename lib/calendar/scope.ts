// Which academic-calendar events a student sees - the one rule, shared by the student calendar and tests.
//
// In each of the three scope columns NULL means "applies to all":
//   schoolId NULL      -> every school        boardId NULL        -> every board        schoolClassId NULL -> every class
// A student sees an event when it is published and each column is either empty or equal to theirs. That one rule
// covers all four kinds the product needs:
//   common event        board + class set, no school      -> every school's students on that board + class
//   school event        school + class set                -> only that school's students of that class
//   school-wide event   school set, nothing else          -> every student of that school
//   platform-wide       nothing set (super admin only)    -> every student
// As with study materials, a student who has no school, board or class yet sees nothing until an administrator
// places them.
import type { Prisma } from "@prisma/client";

export interface StudentCalendarScope {
  schoolId: string | null;
  schoolClassId: string | null;
  boardId: string | null;
}

export function studentAcademicEventWhere(student: StudentCalendarScope): Prisma.AcademicEventWhereInput | null {
  if (!student.schoolId || !student.schoolClassId || !student.boardId) return null;
  return {
    isPublished: true,
    AND: [
      { OR: [{ schoolId: null }, { schoolId: student.schoolId }] },
      { OR: [{ boardId: null }, { boardId: student.boardId }] },
      { OR: [{ schoolClassId: null }, { schoolClassId: student.schoolClassId }] },
    ],
  };
}

export interface TeacherCalendarScope {
  schoolId: string | null;
  /** The board + class of every class the teacher is assigned to teach. */
  classes: { boardId: string; schoolClassId: string }[];
}

/**
 * Which academic-calendar events a teacher sees: published ones that apply to their own school (or to every school),
 * and either to everyone (no board/class set) or to a board + class they are assigned to teach. The same scope columns
 * and NULL-means-all rule as for students, applied once per assigned class. A teacher without a school sees nothing,
 * just as a student without one does.
 */
export function teacherAcademicEventWhere(teacher: TeacherCalendarScope): Prisma.AcademicEventWhereInput | null {
  if (!teacher.schoolId) return null;
  const forClass = (c: { boardId: string; schoolClassId: string }): Prisma.AcademicEventWhereInput => ({
    AND: [{ OR: [{ boardId: null }, { boardId: c.boardId }] }, { OR: [{ schoolClassId: null }, { schoolClassId: c.schoolClassId }] }],
  });
  return {
    isPublished: true,
    AND: [
      { OR: [{ schoolId: null }, { schoolId: teacher.schoolId }] },
      { OR: [{ boardId: null, schoolClassId: null }, ...teacher.classes.map(forClass)] },
    ],
  };
}
