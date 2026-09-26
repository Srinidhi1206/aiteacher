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
 * Recomputes mastery for every topic the student has graded results for,
 * from real ExamAnswer rows (marksAwarded/marks) AND real practice Score rows
 * (marksScored/marksTotal; Score.topic holds the topic id), so tests and
 * practice feed one mastery number. Persists to StudentTopicProgress. Returns the topics touched, so callers
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

  // Practice results count toward the same per-topic mastery. Score.topic is a
  // free-text column; practice stores the topic id in it (see lib/actions/practice.ts).
  const practiceScores = await prisma.score.findMany({
    where: { attempt: { studentId } },
    include: { attempt: { select: { createdAt: true } } },
  });
  for (const sc of practiceScores) {
    const bucket = byTopic.get(sc.topic) ?? { scored: 0, total: 0, lastPracticedAt: null, count: 0 };
    bucket.scored += sc.marksScored;
    bucket.total += sc.marksTotal;
    bucket.count += 1;
    if (!bucket.lastPracticedAt || sc.attempt.createdAt > bucket.lastPracticedAt) bucket.lastPracticedAt = sc.attempt.createdAt;
    byTopic.set(sc.topic, bucket);
  }

  // Only real topics of this student's curriculum may get a progress row.
  const knownTopics = new Set(
    (await prisma.topic.findMany({ where: { id: { in: [...byTopic.keys()] } }, select: { id: true } })).map((t) => t.id)
  );

  const results: { topicId: string; masteryPct: number; attemptCount: number }[] = [];
  for (const [topicId, bucket] of byTopic) {
    if (!knownTopics.has(topicId)) continue;
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

export interface TopicResult {
  pct: number; // 0-100 for this one question
  correct: boolean;
  at: Date;
}

/**
 * The student's most recent graded results on one topic, newest first, from
 * exams AND practice - what the weak-area / strength engines use for their
 * reason text and trend so both signals are treated the same way.
 */
export async function getRecentTopicResults(studentId: string, topicId: string, take = 5): Promise<TopicResult[]> {
  const [answers, scores] = await Promise.all([
    prisma.examAnswer.findMany({
      where: { question: { topicId }, submission: { studentId }, marksAwarded: { not: null } },
      include: { question: true, submission: true },
      orderBy: { submission: { submittedAt: "desc" } },
      take,
    }),
    prisma.score.findMany({
      where: { topic: topicId, attempt: { studentId } },
      include: { attempt: { select: { createdAt: true } } },
      orderBy: { attempt: { createdAt: "desc" } },
      take,
    }),
  ]);
  const items: TopicResult[] = [
    ...answers.map((a) => ({
      pct: a.question.marks > 0 ? Math.round(((a.marksAwarded ?? 0) / a.question.marks) * 100) : 0,
      correct: (a.marksAwarded ?? 0) >= a.question.marks,
      at: a.submission.submittedAt ?? new Date(0),
    })),
    ...scores.map((sc) => ({
      pct: sc.marksTotal > 0 ? Math.round((sc.marksScored / sc.marksTotal) * 100) : 0,
      correct: sc.isCorrect,
      at: sc.attempt.createdAt,
    })),
  ];
  return items.sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, take);
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
