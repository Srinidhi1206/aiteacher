// Server-side check that a study material's curriculum placement is internally consistent:
//   board -> class belongs to that board -> subject is taught in that class -> chapter belongs to that subject
//   -> topic (if any) belongs to that chapter.
// The upload form's cascading dropdowns already make this hold for normal use, but the form is only a
// convenience: a request can be crafted with any ids, and a mismatch would file a material under the wrong
// board or class - which, with shared content, would put it in front of the wrong students. So the server
// verifies the chain itself. Read-only; returns a message for the first broken link, or null when all is well.
import { prisma } from "@/lib/prisma";

export interface MaterialPlacement {
  boardId: string;
  schoolClassId: string;
  subjectId: string;
  chapterId?: string | null;
  topicId?: string | null;
}

export async function checkMaterialPlacement(p: MaterialPlacement): Promise<string | null> {
  const schoolClass = await prisma.schoolClass.findUnique({ where: { id: p.schoolClassId }, select: { boardId: true } });
  if (!schoolClass || schoolClass.boardId !== p.boardId) return "The selected class does not belong to the selected board.";

  const link = await prisma.schoolClassSubject.findUnique({
    where: { schoolClassId_subjectId: { schoolClassId: p.schoolClassId, subjectId: p.subjectId } },
    select: { isEnabled: true },
  });
  if (!link || !link.isEnabled) return "The selected subject is not taught in the selected class.";

  if (p.chapterId) {
    const chapter = await prisma.chapter.findUnique({ where: { id: p.chapterId }, select: { subjectId: true } });
    if (!chapter || chapter.subjectId !== p.subjectId) return "The selected chapter does not belong to the selected subject.";
  }
  if (p.topicId) {
    if (!p.chapterId) return "A topic can only be chosen together with its chapter.";
    const topic = await prisma.topic.findUnique({ where: { id: p.topicId }, select: { chapterId: true } });
    if (!topic || topic.chapterId !== p.chapterId) return "The selected topic does not belong to the selected chapter.";
  }
  return null;
}
