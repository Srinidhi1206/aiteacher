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

async function requireStudentScope() {
  const session = await requireRole("student");
  const student = await prisma.student.findUnique({
    where: { userId: session.id },
    select: {
      id: true,
      schoolId: true,
      schoolClassId: true,
      schoolClass: { select: { label: true, board: { select: { shortName: true } } } },
    },
  });
  if (!student) throw new ForbiddenError("Student profile not found.");
  return student;
}

/** Published materials of the student's own school + class, optionally narrowed. */
function materialsWhere(student: { schoolId: string | null; schoolClassId: string | null }, extra: Record<string, unknown> = {}) {
  return { schoolId: student.schoolId ?? "__none__", schoolClassId: student.schoolClassId ?? "__none__", isPublished: true, ...extra };
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

export interface MyMaterial {
  id: string;
  title: string;
  fileUrl: string;
  materialType: string;
  chapterId: string;
  topicId: string | null;
}

export interface MySubjectDetail {
  id: string;
  name: string;
  classLabel: string | null;
  chapters: {
    id: string;
    name: string;
    topics: { id: string; name: string; bloomLevel: string; status: "WEAK" | "DEVELOPING" | "STRONG" | null; mastery: number | null }[];
    materials: MyMaterial[];
  }[];
}

export async function getMySubject(subjectId: string): Promise<MySubjectDetail | null> {
  const student = await requireStudentScope();
  if (!student.schoolClassId || !(await isSubjectInMyClass(student.schoolClassId, subjectId))) return null;

  const subject = await prisma.subject.findUnique({
    where: { id: subjectId },
    include: { chapters: { orderBy: { order: "asc" }, include: { topics: { orderBy: { order: "asc" } } } } },
  });
  if (!subject) return null;

  const topicIds = subject.chapters.flatMap((c) => c.topics.map((t) => t.id));
  const [progressRows, materials] = await Promise.all([
    topicIds.length ? prisma.studentTopicProgress.findMany({ where: { studentId: student.id, topicId: { in: topicIds } } }) : Promise.resolve([]),
    prisma.studyMaterial.findMany({
      where: materialsWhere(student, { subjectId }),
      select: { id: true, title: true, fileUrl: true, materialType: true, chapterId: true, topicId: true },
      orderBy: { uploadedAt: "desc" },
    }),
  ]);
  const progressByTopic = new Map(progressRows.map((p) => [p.topicId, p]));

  return {
    id: subject.id,
    name: subject.name,
    classLabel: student.schoolClass?.label ?? null,
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
      materials: materials.filter((m) => m.chapterId === c.id),
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

  const [progress, materials] = await Promise.all([
    prisma.studentTopicProgress.findUnique({ where: { studentId_topicId: { studentId: student.id, topicId } } }),
    prisma.studyMaterial.findMany({
      // Materials filed under this topic, plus chapter-level ones with no topic.
      where: materialsWhere(student, { subjectId, chapterId: topic.chapterId, OR: [{ topicId }, { topicId: null }] }),
      select: { id: true, title: true, fileUrl: true, materialType: true, chapterId: true, topicId: true },
      orderBy: { uploadedAt: "desc" },
    }),
  ]);

  return {
    subjectId,
    subjectName: topic.chapter.subject.name,
    chapterName: topic.chapter.name,
    topic: { id: topic.id, name: topic.name, bloomLevel: topic.bloomLevel },
    status: progress?.status ?? null,
    mastery: progress?.mastery ?? null,
    materials,
  };
}
