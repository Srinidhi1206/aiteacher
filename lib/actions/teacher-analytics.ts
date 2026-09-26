"use server";

// Real teacher-facing analytics (Stage H). Every exported function
// re-derives the teacher from the session and re-validates the requested
// class/subject against that teacher's own TeacherAssignment rows - the
// same authorization primitive lib/actions/exams.ts already uses for
// exam creation, reused here rather than duplicated. A teacher can never
// see another teacher's class/subject data: there is no code path that
// accepts a class/subject without this check running first, and "which
// exams count" is always additionally filtered by teacherId.
import { prisma } from "@/lib/prisma";
import { requireOwnedAssignment } from "./exams";

const MIN_ANSWERS_FOR_TOPIC_DIFFICULTY = 3;
const MIN_STUDENTS_FOR_TOPIC_DIFFICULTY = 2;

export interface ClassOverview {
  className: string;
  subjectName: string;
  studentCount: number;
  examCount: number;
  totalSubmissions: number;
  gradedSubmissions: number;
  averageScorePct: number | null;
  participationPct: number | null;
  completionRatePct: number | null;
}

async function getOwnedExamIds(schoolClassId: string, subjectId: string, teacherId: string) {
  const exams = await prisma.exam.findMany({ where: { schoolClassId, subjectId, teacherId }, select: { id: true } });
  return exams.map((e) => e.id);
}

// A class (board + grade) is shared by every school on that board, so the
// roster is always "this class, in the teacher's own school" - the school
// comes from the teacher's own row (requireOwnedAssignment), never from the
// client - and only accounts that can actually sign in (ACTIVE), not
// rejected/pending/suspended ones.
function classRosterWhere(schoolClassId: string, schoolId: string) {
  return { schoolClassId, schoolId, user: { status: "ACTIVE" as const } };
}

export async function getClassOverview(schoolClassId: string, subjectId: string): Promise<ClassOverview> {
  const { teacher, schoolId } = await requireOwnedAssignment(schoolClassId, subjectId);

  const [schoolClass, subject, studentCount, examIds] = await Promise.all([
    prisma.schoolClass.findUnique({ where: { id: schoolClassId }, select: { label: true } }),
    prisma.subject.findUnique({ where: { id: subjectId }, select: { name: true } }),
    prisma.student.count({ where: classRosterWhere(schoolClassId, schoolId) }),
    getOwnedExamIds(schoolClassId, subjectId, teacher.id),
  ]);

  const submissions =
    examIds.length > 0
      ? await prisma.examSubmission.findMany({
          where: { examId: { in: examIds }, status: { not: "NOT_STARTED" } },
          select: { studentId: true, status: true, totalScore: true, maxScore: true },
        })
      : [];

  const graded = submissions.filter((s) => s.totalScore != null && s.maxScore);
  const distinctParticipants = new Set(submissions.map((s) => s.studentId)).size;
  const terminal = submissions.filter((s) => s.status === "SUBMITTED" || s.status === "GRADED").length;

  return {
    className: schoolClass?.label ?? "Unknown class",
    subjectName: subject?.name ?? "Unknown subject",
    studentCount,
    examCount: examIds.length,
    totalSubmissions: submissions.length,
    gradedSubmissions: graded.length,
    averageScorePct:
      graded.length > 0 ? Math.round(graded.reduce((sum, s) => sum + (s.totalScore! / s.maxScore!) * 100, 0) / graded.length) : null,
    participationPct: studentCount > 0 ? Math.round((distinctParticipants / studentCount) * 100) : null,
    completionRatePct: submissions.length > 0 ? Math.round((terminal / submissions.length) * 100) : null,
  };
}

export interface StudentPerformanceRow {
  studentId: string;
  name: string;
  examsAttempted: number;
  averageScorePct: number | null; // null = "No graded activity yet", never a fabricated 0
  completionPct: number | null;
  weakTopicCount: number;
  strengthCount: number;
}

export async function getStudentPerformanceTable(schoolClassId: string, subjectId: string): Promise<StudentPerformanceRow[]> {
  const { teacher, schoolId } = await requireOwnedAssignment(schoolClassId, subjectId);

  const students = await prisma.student.findMany({
    where: classRosterWhere(schoolClassId, schoolId),
    include: { user: { select: { name: true } } },
    orderBy: { user: { name: "asc" } },
  });
  if (students.length === 0) return [];
  const studentIds = students.map((s) => s.id);

  const examIds = await getOwnedExamIds(schoolClassId, subjectId, teacher.id);
  const submissions =
    examIds.length > 0
      ? await prisma.examSubmission.findMany({
          where: { examId: { in: examIds }, studentId: { in: studentIds }, status: { not: "NOT_STARTED" } },
          select: { studentId: true, status: true, totalScore: true, maxScore: true },
        })
      : [];

  const [weakRows, strongRows] = await Promise.all([
    prisma.weaknessProfile.findMany({
      where: { studentId: { in: studentIds }, topic: { chapter: { subjectId } } },
      select: { studentId: true },
    }),
    prisma.strengthProfile.findMany({
      where: { studentId: { in: studentIds }, topic: { chapter: { subjectId } } },
      select: { studentId: true },
    }),
  ]);

  function countFor(rows: { studentId: string }[], id: string) {
    return rows.filter((r) => r.studentId === id).length;
  }

  return students.map((s) => {
    const mine = submissions.filter((sub) => sub.studentId === s.id);
    const graded = mine.filter((sub) => sub.totalScore != null && sub.maxScore);
    const terminal = mine.filter((sub) => sub.status === "SUBMITTED" || sub.status === "GRADED").length;
    return {
      studentId: s.id,
      name: s.user.name,
      examsAttempted: mine.length,
      averageScorePct: graded.length > 0 ? Math.round(graded.reduce((sum, sub) => sum + (sub.totalScore! / sub.maxScore!) * 100, 0) / graded.length) : null,
      completionPct: examIds.length > 0 ? Math.round((terminal / examIds.length) * 100) : null,
      weakTopicCount: countFor(weakRows, s.id),
      strengthCount: countFor(strongRows, s.id),
    };
  });
}

export interface TopicDifficultyRow {
  topicId: string;
  topicName: string;
  chapterName: string;
  answerCount: number;
  studentCount: number;
  strugglingPct: number; // % of answers below full marks
}

/** Topics students in this class/subject consistently get wrong, from this teacher's own exams only. */
export async function getClassTopicDifficulty(schoolClassId: string, subjectId: string): Promise<TopicDifficultyRow[]> {
  const { teacher } = await requireOwnedAssignment(schoolClassId, subjectId);
  const examIds = await getOwnedExamIds(schoolClassId, subjectId, teacher.id);
  if (examIds.length === 0) return [];

  const answers = await prisma.examAnswer.findMany({
    where: { marksAwarded: { not: null }, question: { examId: { in: examIds }, topicId: { not: null } } },
    select: {
      marksAwarded: true,
      submission: { select: { studentId: true } },
      question: { select: { marks: true, topicId: true, topic: { select: { name: true, chapter: { select: { name: true } } } } } },
    },
  });

  const byTopic = new Map<
    string,
    { name: string; chapter: string; answers: number; struggling: number; students: Set<string> }
  >();
  for (const a of answers) {
    const topicId = a.question.topicId!;
    const bucket = byTopic.get(topicId) ?? {
      name: a.question.topic!.name,
      chapter: a.question.topic!.chapter.name,
      answers: 0,
      struggling: 0,
      students: new Set<string>(),
    };
    bucket.answers += 1;
    if ((a.marksAwarded ?? 0) < a.question.marks) bucket.struggling += 1;
    bucket.students.add(a.submission.studentId);
    byTopic.set(topicId, bucket);
  }

  return [...byTopic.entries()]
    .map(([topicId, b]) => ({
      topicId,
      topicName: b.name,
      chapterName: b.chapter,
      answerCount: b.answers,
      studentCount: b.students.size,
      strugglingPct: Math.round((b.struggling / b.answers) * 100),
    }))
    .filter((t) => t.answerCount >= MIN_ANSWERS_FOR_TOPIC_DIFFICULTY && t.studentCount >= MIN_STUDENTS_FOR_TOPIC_DIFFICULTY)
    .sort((a, b) => b.strugglingPct - a.strugglingPct)
    .slice(0, 8);
}
