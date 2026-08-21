// Mirror of weakness.ts for topics a student is strong in (Stage E3).
// Same recency-weighted, explainable approach - never labels a strength
// off a single question (MIN_ATTEMPTS_FOR_STRENGTH below).
import "server-only";
import { prisma } from "@/lib/prisma";
import { recalculateTopicProgress, MASTERY_THRESHOLDS } from "./progress";

const MIN_ATTEMPTS_FOR_STRENGTH = 3;

function buildReason(masteryPct: number, attemptCount: number): string {
  return `Consistently high performance across ${attemptCount} recent assessments (${masteryPct}% average).`;
}

function trendFor(history: number[]): "IMPROVING" | "DECLINING" | "STABLE" {
  if (history.length < 2) return "STABLE";
  const [latest, previous] = history;
  if (latest > previous + 5) return "IMPROVING";
  if (latest < previous - 5) return "DECLINING";
  return "STABLE";
}

export async function recalculateStrengths(studentId: string) {
  const topics = await recalculateTopicProgress(studentId);
  const strongTopicIds = new Set<string>();

  for (const t of topics) {
    if (t.masteryPct < MASTERY_THRESHOLDS.strong) continue;
    if (t.attemptCount < MIN_ATTEMPTS_FOR_STRENGTH) continue; // one question doesn't make a strength
    strongTopicIds.add(t.topicId);

    const recentAnswers = await prisma.examAnswer.findMany({
      where: { question: { topicId: t.topicId }, submission: { studentId }, marksAwarded: { not: null } },
      include: { question: true, submission: true },
      orderBy: { submission: { submittedAt: "desc" } },
      take: 5,
    });
    const history = recentAnswers.map((a) => Math.round(((a.marksAwarded ?? 0) / a.question.marks) * 100));

    await prisma.strengthProfile.upsert({
      where: { studentId_topicId: { studentId, topicId: t.topicId } },
      update: {
        reason: buildReason(t.masteryPct, recentAnswers.length),
        mastery: t.masteryPct,
        trend: trendFor(history),
        trendHistory: history,
        lastPracticed: recentAnswers[0]?.submission.submittedAt ?? new Date(),
      },
      create: {
        studentId,
        topicId: t.topicId,
        reason: buildReason(t.masteryPct, recentAnswers.length),
        mastery: t.masteryPct,
        trend: trendFor(history),
        trendHistory: history,
        lastPracticed: recentAnswers[0]?.submission.submittedAt ?? new Date(),
      },
    });
  }

  await prisma.strengthProfile.deleteMany({
    where: { studentId, topicId: { notIn: [...strongTopicIds] } },
  });

  return getStrengthsForStudent(studentId);
}

export async function getStrengthsForStudent(studentId: string) {
  return prisma.strengthProfile.findMany({
    where: { studentId },
    include: { topic: { include: { chapter: { include: { subject: true } } } } },
    orderBy: { mastery: "desc" },
  });
}
