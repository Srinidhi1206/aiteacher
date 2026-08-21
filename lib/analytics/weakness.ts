// Deterministic weak-area detection (Stage E2). No LLM involved - this is
// arithmetic over real graded answers, matching the existing mocked
// algorithm's rules (see docs/ARCHITECTURE.md's "Weakness Detection"
// section) now run for real instead of hand-authored.
import "server-only";
import { prisma } from "@/lib/prisma";
import { recalculateTopicProgress, MASTERY_THRESHOLDS } from "./progress";

const MIN_ATTEMPTS_TO_FLAG = 2; // don't flag a topic weak off a single question

function buildReason(masteryPct: number, recentCorrect: number, recentTotal: number): string {
  const wrongCount = recentTotal - recentCorrect;
  if (wrongCount >= Math.ceil(recentTotal / 2) && recentTotal >= 2) {
    return `${wrongCount} of the last ${recentTotal} attempts were incorrect.`;
  }
  return `Average score is ${masteryPct}% across ${recentTotal} attempt${recentTotal === 1 ? "" : "s"}.`;
}

function trendFor(history: number[]): "IMPROVING" | "DECLINING" | "STABLE" {
  if (history.length < 2) return "STABLE";
  const [latest, previous] = history; // history is most-recent-first
  if (latest > previous + 5) return "IMPROVING";
  if (latest < previous - 5) return "DECLINING";
  return "STABLE";
}

/**
 * Recomputes and persists WeaknessProfile rows for a student. Returns the
 * up-to-date list. Call after any grading event; safe to call repeatedly
 * (upserts, and clears profiles for topics that are no longer weak).
 */
export async function recalculateWeakAreas(studentId: string) {
  const topics = await recalculateTopicProgress(studentId);
  const weakTopicIds = new Set<string>();

  for (const t of topics) {
    if (t.masteryPct >= MASTERY_THRESHOLDS.weak) continue;
    if (t.attemptCount < MIN_ATTEMPTS_TO_FLAG) continue;
    weakTopicIds.add(t.topicId);

    const recentAnswers = await prisma.examAnswer.findMany({
      where: { question: { topicId: t.topicId }, submission: { studentId }, marksAwarded: { not: null } },
      include: { question: true, submission: true },
      orderBy: { submission: { submittedAt: "desc" } },
      take: 5,
    });
    const recentCorrect = recentAnswers.filter((a) => (a.marksAwarded ?? 0) >= a.question.marks).length;
    const history = recentAnswers.map((a) => Math.round(((a.marksAwarded ?? 0) / a.question.marks) * 100));

    await prisma.weaknessProfile.upsert({
      where: { studentId_topicId: { studentId, topicId: t.topicId } },
      update: {
        reason: buildReason(t.masteryPct, recentCorrect, recentAnswers.length),
        wrongAnswers: recentAnswers.length - recentCorrect,
        totalAttempts: t.attemptCount,
        mastery: t.masteryPct,
        trend: trendFor(history),
        trendHistory: history,
        lastPracticed: recentAnswers[0]?.submission.submittedAt ?? new Date(),
      },
      create: {
        studentId,
        topicId: t.topicId,
        reason: buildReason(t.masteryPct, recentCorrect, recentAnswers.length),
        wrongAnswers: recentAnswers.length - recentCorrect,
        totalAttempts: t.attemptCount,
        mastery: t.masteryPct,
        trend: trendFor(history),
        trendHistory: history,
        lastPracticed: recentAnswers[0]?.submission.submittedAt ?? new Date(),
      },
    });
  }

  // A topic that recovered above the weak threshold should stop showing up.
  await prisma.weaknessProfile.deleteMany({
    where: { studentId, topicId: { notIn: [...weakTopicIds] } },
  });

  return getWeakAreasForStudent(studentId);
}

export async function getWeakAreasForStudent(studentId: string) {
  return prisma.weaknessProfile.findMany({
    where: { studentId },
    include: { topic: { include: { chapter: { include: { subject: true } } } } },
    orderBy: { mastery: "asc" },
  });
}
