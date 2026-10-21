"use server";

// The signed-in student's own curriculum: their class's subjects, each
// subject's chapters and topics, their real progress on them, and the
// published study materials their school has attached to them. This is the
// real State -> Board -> Class -> Subject -> Chapter -> Topic hierarchy from
// the database - the same rows the admin curriculum screen edits and study
// materials are filed under - not the built-in sample subjects.
//
// Scope always comes from the student's own row (never from a client id):
//   - which subjects: the SchoolClassSubject links of THEIR class;
//   - which materials: published, and of THEIR school + class (a class row is
//     shared by every school on the board, so the school has to match too).
// A subject/topic id that isn't in the student's own class answers exactly
// like one that doesn't exist, so another board's or class's curriculum can't
// be probed by guessing ids.
import { prisma } from "@/lib/prisma";
import { requireRole, ForbiddenError } from "@/lib/auth/current-session";
import { studentMaterialWhere } from "@/lib/materials/scope";
import { parseIndexStatus } from "@/lib/rag/index-status";
import type { Prisma } from "@prisma/client";

async function requireStudentScope() {
  const session = await requireRole("student");
  const student = await prisma.student.findUnique({
    where: { userId: session.id },
    select: {
      id: true,
      schoolId: true,
      schoolClassId: true,
      boardId: true,
      schoolClass: { select: { label: true, board: { select: { shortName: true } } } },
    },
  });
  if (!student) throw new ForbiddenError("Student profile not found.");
  return student;
}

/**
 * Published materials this student may see - common to their board + class, or private to their school - optionally
 * narrowed. The rule itself lives in lib/materials/scope.ts and is shared with the Materials page and the AI Tutor.
 * A student with no school, board or class gets a filter that matches nothing.
 */
function materialsWhere(
  student: { schoolId: string | null; schoolClassId: string | null; boardId: string | null },
  extra?: Prisma.StudyMaterialWhereInput
): Prisma.StudyMaterialWhereInput {
  return studentMaterialWhere(student, extra) ?? { id: "__none__" };
}

async function isSubjectInMyClass(schoolClassId: string, subjectId: string) {
  const link = await prisma.schoolClassSubject.findUnique({
    where: { schoolClassId_subjectId: { schoolClassId, subjectId } },
    select: { isEnabled: true },
  });
  return link?.isEnabled === true;
}

export interface MySubjectSummary {
  id: string;
  name: string;
  chapterCount: number;
  topicCount: number;
  materialCount: number;
  progress: number | null; // null = no real progress recorded yet, never a fabricated 0
}

export async function getMySubjects(): Promise<{ classLabel: string | null; boardName: string | null; subjects: MySubjectSummary[] }> {
  const student = await requireStudentScope();
  const classLabel = student.schoolClass?.label ?? null;
  const boardName = student.schoolClass?.board.shortName ?? null;
  if (!student.schoolClassId) return { classLabel, boardName, subjects: [] };

  const [links, progressRows, materialCounts] = await Promise.all([
    prisma.schoolClassSubject.findMany({
      where: { schoolClassId: student.schoolClassId, isEnabled: true },
      include: { subject: { include: { chapters: { select: { _count: { select: { topics: true } } } } } } },
    }),
    prisma.studentSubjectProgress.findMany({ where: { studentId: student.id } }),
    prisma.studyMaterial.groupBy({ by: ["subjectId"], where: materialsWhere(student), _count: true }),
  ]);
  const progressBySubject = new Map(progressRows.map((p) => [p.subjectId, p.progress]));
  const materialsBySubject = new Map(materialCounts.map((m) => [m.subjectId, m._count]));

  const subjects = links
    .map((l) => ({
      id: l.subject.id,
      name: l.subject.name,
      chapterCount: l.subject.chapters.length,
      topicCount: l.subject.chapters.reduce((sum, c) => sum + c._count.topics, 0),
      materialCount: materialsBySubject.get(l.subject.id) ?? 0,
      progress: progressBySubject.get(l.subject.id) ?? null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return { classLabel, boardName, subjects };
}

/**
 * The ids and names of the student's own subjects, chapters and topics - just enough for the Study Plan to link a task to the chapter or topic it is about
 * (lib/study-plan/task-links.ts). Same scope as everything else here: only the subjects enabled for the student's own class.
 */
export async function getMyCurriculumLinks(): Promise<import("@/lib/study-plan/task-links").LinkSubject[]> {
  const student = await requireStudentScope();
  if (!student.schoolClassId) return [];
  const links = await prisma.schoolClassSubject.findMany({
    where: { schoolClassId: student.schoolClassId, isEnabled: true },
    select: { subject: { select: { id: true, name: true, chapters: { orderBy: [{ order: "asc" }, { id: "asc" }], select: { id: true, name: true, topics: { orderBy: [{ order: "asc" }, { id: "asc" }], select: { id: true, name: true } } } } } } },
  });
  return links.map((l) => l.subject);
}

export interface MyMaterial {
  id: string;
  title: string;
  fileUrl: string;
  materialType: string;
  /** null = a material for the whole subject (for example a complete textbook), not one chapter. */
  chapterId: string | null;
  topicId: string | null;
}

/**
 * Where a chapter starts in a complete textbook the student's school has shared - only when that is KNOWN: the textbook is a whole-subject material that has been fully indexed, and its passages were
 * linked to this chapter from verified chapter page ranges (lib/curriculum-import-data/chapter-page-maps.ts). `page` is the first PDF page with the chapter's text. Nothing is guessed: no verified link, no section.
 */
export interface MyTextbookSection {
  materialId: string;
  title: string;
  fileUrl: string;
  page: number;
}

export interface MySubjectDetail {
  id: string;
  name: string;
  classLabel: string | null;
  /** Materials for the whole subject (no chapter), e.g. the complete textbook. */
  subjectMaterials: MyMaterial[];
  chapters: {
    id: string;
    name: string;
    topics: { id: string; name: string; bloomLevel: string; status: "WEAK" | "DEVELOPING" | "STRONG" | null; mastery: number | null }[];
    materials: MyMaterial[];
    /** Where the chapter starts in the textbook, when that is verified; null otherwise. */
    textbook: MyTextbookSection | null;
  }[];
}

/**
 * The verified textbook section of each given chapter: for every complete whole-subject textbook among `materials`, the first page whose passages were linked to the chapter. Only whole-subject textbooks count -
 * a passage of a material filed under a chapter carries that chapter whatever its page, so only a material with NO chapter can have got its chapter links from the verified page ranges.
 */
async function textbookSections(
  materials: { id: string; title: string; fileUrl: string; materialType: string; chapterId: string | null; indexError: string | null }[],
  chapterIds: string[]
): Promise<Map<string, MyTextbookSection>> {
  const books = materials.filter((m) => m.materialType === "TEXTBOOK" && m.chapterId === null && parseIndexStatus(m.indexError)?.kind === "complete");
  const out = new Map<string, MyTextbookSection>();
  if (books.length === 0 || chapterIds.length === 0) return out;
  const rows = await prisma.materialChunk.groupBy({
    by: ["materialId", "chapterId"],
    where: { materialId: { in: books.map((b) => b.id) }, chapterId: { in: chapterIds }, page: { not: null } },
    _min: { page: true },
  });
  for (const book of books) {
    for (const r of rows) {
      if (r.materialId !== book.id || !r.chapterId || r._min.page === null || out.has(r.chapterId)) continue;
      out.set(r.chapterId, { materialId: book.id, title: book.title, fileUrl: book.fileUrl, page: r._min.page });
    }
  }
  return out;
}

export async function getMySubject(subjectId: string): Promise<MySubjectDetail | null> {
  const student = await requireStudentScope();
  if (!student.schoolClassId || !(await isSubjectInMyClass(student.schoolClassId, subjectId))) return null;

  const subject = await prisma.subject.findUnique({
    where: { id: subjectId },
    include: { chapters: { orderBy: [{ order: "asc" }, { id: "asc" }], include: { topics: { orderBy: [{ order: "asc" }, { id: "asc" }] } } } },
  });
  if (!subject) return null;

  const topicIds = subject.chapters.flatMap((c) => c.topics.map((t) => t.id));
  const [progressRows, materials] = await Promise.all([
    topicIds.length ? prisma.studentTopicProgress.findMany({ where: { studentId: student.id, topicId: { in: topicIds } } }) : Promise.resolve([]),
    prisma.studyMaterial.findMany({
      where: materialsWhere(student, { subjectId }),
      select: { id: true, title: true, fileUrl: true, materialType: true, chapterId: true, topicId: true, indexError: true },
      orderBy: { uploadedAt: "desc" },
    }),
  ]);
  const progressByTopic = new Map(progressRows.map((p) => [p.topicId, p]));
  const sections = await textbookSections(materials, subject.chapters.map((c) => c.id));
  const visible: MyMaterial[] = materials.map(({ indexError: _indexError, ...m }) => m);

  return {
    id: subject.id,
    name: subject.name,
    classLabel: student.schoolClass?.label ?? null,
    subjectMaterials: visible.filter((m) => m.chapterId === null),
    chapters: subject.chapters.map((c) => ({
      id: c.id,
      name: c.name,
      topics: c.topics.map((t) => ({
        id: t.id,
        name: t.name,
        bloomLevel: t.bloomLevel,
        status: progressByTopic.get(t.id)?.status ?? null,
        mastery: progressByTopic.get(t.id)?.mastery ?? null,
      })),
      materials: visible.filter((m) => m.chapterId === c.id),
      textbook: sections.get(c.id) ?? null,
    })),
  };
}

export interface MyTopicDetail {
  subjectId: string;
  subjectName: string;
  chapterName: string;
  topic: { id: string; name: string; bloomLevel: string };
  status: "WEAK" | "DEVELOPING" | "STRONG" | null;
  mastery: number | null;
  materials: MyMaterial[];
  /** Where this topic's CHAPTER starts in the textbook, when that is verified (a topic has no page of its own on record). */
  chapterTextbook: MyTextbookSection | null;
}

export async function getMyTopic(subjectId: string, topicId: string): Promise<MyTopicDetail | null> {
  const student = await requireStudentScope();
  if (!student.schoolClassId || !(await isSubjectInMyClass(student.schoolClassId, subjectId))) return null;

  const topic = await prisma.topic.findUnique({
    where: { id: topicId },
    include: { chapter: { include: { subject: { select: { id: true, name: true } } } } },
  });
  // The topic must belong to the subject in the URL, which is in this student's class.
  if (!topic || topic.chapter.subjectId !== subjectId) return null;

  const [progress, materials, books] = await Promise.all([
    prisma.studentTopicProgress.findUnique({ where: { studentId_topicId: { studentId: student.id, topicId } } }),
    prisma.studyMaterial.findMany({
      // Materials filed under this topic, plus chapter-level ones with no topic.
      where: materialsWhere(student, { subjectId, chapterId: topic.chapterId, OR: [{ topicId }, { topicId: null }] }),
      select: { id: true, title: true, fileUrl: true, materialType: true, chapterId: true, topicId: true },
      orderBy: { uploadedAt: "desc" },
    }),
    // The complete textbooks of the subject (no chapter), for where this chapter starts in them.
    prisma.studyMaterial.findMany({
      where: materialsWhere(student, { subjectId, chapterId: null, materialType: "TEXTBOOK" }),
      select: { id: true, title: true, fileUrl: true, materialType: true, chapterId: true, indexError: true },
      orderBy: { uploadedAt: "desc" },
    }),
  ]);
  const chapterTextbook = (await textbookSections(books, [topic.chapterId])).get(topic.chapterId) ?? null;

  return {
    subjectId,
    subjectName: topic.chapter.subject.name,
    chapterName: topic.chapter.name,
    topic: { id: topic.id, name: topic.name, bloomLevel: topic.bloomLevel },
    status: progress?.status ?? null,
    mastery: progress?.mastery ?? null,
    materials,
    chapterTextbook,
  };
}
