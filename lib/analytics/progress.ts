// Reusable, server-side progress calculation (Stage E1). Never compute
// these numbers only inside a React component - every page that shows
// progress should read from StudentSubjectProgress/StudentTopicProgress
// (persisted here), not recompute ad hoc in a component.
//
// Called after grading events (exam finalized, worksheet graded) to keep
// the persisted rows current, and by pages that display progress.
import "server-only";
import { prisma } from "@/lib/prisma";
import type { TopicStatus } from "@prisma/client";

export const MASTERY_THRESHOLDS = {
  weak: 50, // < this = WEAK
  strong: 80, // >= this = STRONG (and needs MIN_ATTEMPTS_FOR_STRENGTH, see strengths.ts)
};

function topicStatusFor(masteryPct: number): TopicStatus {
  if (masteryPct < MASTERY_THRESHOLDS.weak) return "WEAK";
  if (masteryPct >= MASTERY_THRESHOLDS.strong) return "STRONG";
  return "DEVELOPING";
}

/**
 * Recomputes mastery for every topic the student has graded exam answers
 * for, from real ExamAnswer rows (marksAwarded/marks), most recent first.
 * Persists to StudentTopicProgress. Returns the topics touched, so callers
 * (weakness/strength detection) don't need to re-query.
 */
export async function recalculateTopicProgress(studentId: string): Promise<{ topicId: string; masteryPct: number; attemptCount: number }[]> {
  const answers = await prisma.examAnswer.findMany({
    where: {
      marksAwarded: { not: null },
      question: { topicId: { not: null } },
      submission: { studentId },
    },
    include: { question: true, submission: true },
    orderBy: { submission: { submittedAt: "desc" } },
  });

  const byTopic = new Map<string, { scored: number; total: number; lastPracticedAt: Date | null; count: number }>();
  for (const a of answers) {
    const topicId = a.question.topicId!;
    const bucket = byTopic.get(topicId) ?? { scored: 0, total: 0, lastPracticedAt: null, count: 0 };
    bucket.scored += a.marksAwarded ?? 0;
    bucket.total += a.question.marks;
    bucket.count += 1;
    const submittedAt = a.submission.submittedAt;
    if (submittedAt && (!bucket.lastPracticedAt || submittedAt > bucket.lastPracticedAt)) bucket.lastPracticedAt = submittedAt;
    byTopic.set(topicId, bucket);
  }

  const results: { topicId: string; masteryPct: number; attemptCount: number }[] = [];
  for (const [topicId, bucket] of byTopic) {
    const masteryPct = bucket.total > 0 ? Math.round((bucket.scored / bucket.total) * 100) : 0;
    await prisma.studentTopicProgress.upsert({
      where: { studentId_topicId: { studentId, topicId } },
      update: { mastery: masteryPct, status: topicStatusFor(masteryPct), lastPracticedAt: bucket.lastPracticedAt },
      create: { studentId, topicId, mastery: masteryPct, status: topicStatusFor(masteryPct), lastPracticedAt: bucket.lastPracticedAt },
    });
    results.push({ topicId, masteryPct, attemptCount: bucket.count });
  }
  return results;
}

/** Subject-level progress = average of its topics' mastery, weighted by attempt count; completion = % of the subject's topics with at least one attempt. */
export async function recalculateSubjectProgress(studentId: string): Promise<void> {
  const student = await prisma.student.findUnique({ where: { id: studentId } });
  if (!student?.schoolClassId) return;

  const subjects = await prisma.subject.findMany({
    where: { schoolClassLinks: { some: { schoolClassId: student.schoolClassId } } },
    include: { chapters: { include: { topics: true } } },
  });

  for (const subject of subjects) {
    const topicIds = subject.chapters.flatMap((c) => c.topics.map((t) => t.id));
    if (topicIds.length === 0) continue;

    const progressRows = await prisma.studentTopicProgress.findMany({
      where: { studentId, topicId: { in: topicIds } },
    });

    const attempted = progressRows.length;
    const completion = Math.round((attempted / topicIds.length) * 100);
    const averageScore = attempted > 0 ? Math.round(progressRows.reduce((sum, p) => sum + p.mastery, 0) / attempted) : 0;

    await prisma.studentSubjectProgress.upsert({
      where: { studentId_subjectId: { studentId, subjectId: subject.id } },
      update: { progress: completion, averageScore },
      create: { studentId, subjectId: subject.id, progress: completion, averageScore },
    });
  }
}

/** Runs both recalculations - call this after any event that changes a student's graded results (exam finalized, worksheet graded). */
export async function recalculateProgressForStudent(studentId: string): Promise<void> {
  await recalculateTopicProgress(studentId);
  await recalculateSubjectProgress(studentId);
}

export async function getSubjectProgressForStudent(studentId: string) {
  return prisma.studentSubjectProgress.findMany({
    where: { studentId },
    include: { subject: true },
    orderBy: { subject: { name: "asc" } },
  });
}

export async function getTopicProgressForStudent(studentId: string) {
  return prisma.studentTopicProgress.findMany({
    where: { studentId },
    include: { topic: { include: { chapter: { include: { subject: true } } } } },
    orderBy: { mastery: "asc" },
  });
}
