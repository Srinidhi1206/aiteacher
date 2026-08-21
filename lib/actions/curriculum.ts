"use server";

// Read-only queries for the State -> Board -> SchoolClass -> Subject ->
// Chapter hierarchy. Shared by admin cascading selectors (materials, exam
// schedule, board & classes management) and student-facing filtering -
// one data-access layer, not duplicated per feature.
import { prisma } from "@/lib/prisma";

export async function listStates() {
  return prisma.state.findMany({
    where: { isEnabled: true },
    orderBy: { name: "asc" },
  });
}

export async function listBoards(stateId?: string | null) {
  // National boards (stateId = null) are always available regardless of
  // the selected state; state boards are scoped to their own state.
  return prisma.board.findMany({
    where: {
      isEnabled: true,
      OR: [{ stateId: null }, ...(stateId ? [{ stateId }] : [])],
    },
    orderBy: [{ type: "asc" }, { shortName: "asc" }],
  });
}

export async function listSchools(stateId?: string | null) {
  return prisma.school.findMany({
    where: { isEnabled: true, ...(stateId ? { stateId } : {}) },
    orderBy: { name: "asc" },
  });
}

export async function listSchoolClasses(boardId: string) {
  return prisma.schoolClass.findMany({
    where: { boardId, isEnabled: true },
    orderBy: { grade: "asc" },
  });
}

export async function listSubjectsForClass(schoolClassId: string) {
  const links = await prisma.schoolClassSubject.findMany({
    where: { schoolClassId, isEnabled: true },
    include: { subject: true },
    orderBy: { subject: { name: "asc" } },
  });
  return links.map((l) => l.subject);
}

export async function listChaptersForSubject(subjectId: string) {
  return prisma.chapter.findMany({
    where: { subjectId },
    orderBy: { order: "asc" },
    include: { topics: { orderBy: { order: "asc" } } },
  });
}

// All boards+classes an admin has enabled, for the Board & Classes screen.
export async function listAllBoardsWithClasses() {
  return prisma.board.findMany({
    orderBy: [{ type: "asc" }, { shortName: "asc" }],
    include: {
      state: true,
      schoolClasses: { orderBy: { grade: "asc" } },
    },
  });
}
