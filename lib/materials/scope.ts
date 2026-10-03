// The ONE definition of which study materials (and which of their indexed passages, for the AI Tutor) a student
// may see. It was previously written out separately in three places - the Materials page, the subject pages and
// the tutor's retrieval - which is how rules drift apart; all three now call this.
//
//   COMMON material   (schoolId = NULL): its board + class + published
//   PRIVATE material  (schoolId = X)   : its school + board + class + published
//
// A student sees a material when board and class match theirs and it is published, and it is either common or
// belongs to THEIR school. Board and class are required columns on every material, so common content is always
// pinned to one board and one class and can never reach another board's or class's students.
//
// A student with no board, no class or no school gets nothing (null): common content is never "every board", and
// a student who has not been placed in a school yet sees no school content until an administrator assigns one.
import type { Prisma } from "@prisma/client";

export interface StudentScope {
  schoolId: string | null;
  schoolClassId: string | null;
  boardId: string | null;
}

export function studentMaterialWhere(student: StudentScope, extra?: Prisma.StudyMaterialWhereInput): Prisma.StudyMaterialWhereInput | null {
  if (!student.schoolId || !student.schoolClassId || !student.boardId) return null;
  return {
    isPublished: true,
    boardId: student.boardId,
    schoolClassId: student.schoolClassId,
    // A subject an administrator has hidden for this class is not part of the student's curriculum, so neither are its materials.
    subject: { schoolClassLinks: { some: { schoolClassId: student.schoolClassId, isEnabled: true } } },
    // AND keeps the caller's own OR (e.g. topic-or-chapter-level) from colliding with this one.
    AND: [{ OR: [{ schoolId: null }, { schoolId: student.schoolId }] }, ...(extra ? [extra] : [])],
  };
}

/** The same rule for indexed passages: class and school are copied onto each passage, board comes from its material. */
export function studentChunkWhere(student: StudentScope): Prisma.MaterialChunkWhereInput | null {
  if (!student.schoolId || !student.schoolClassId || !student.boardId) return null;
  return {
    schoolClassId: student.schoolClassId,
    OR: [{ schoolId: null }, { schoolId: student.schoolId }],
    material: {
      isPublished: true,
      boardId: student.boardId,
      subject: { schoolClassLinks: { some: { schoolClassId: student.schoolClassId, isEnabled: true } } },
    },
  };
}
