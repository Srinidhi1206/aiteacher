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
