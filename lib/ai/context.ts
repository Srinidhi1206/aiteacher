// Assembles the bounded, data-minimized context sent to the AI provider.
// Only ever queries data scoped to the studentId passed in by the caller
// (lib/actions/tutor.ts, which derives it from the authenticated session -
// never from client input) - this module has no way to look up another
// student's data because it never accepts a raw userId or an unscoped
// query. See docs/ARCHITECTURE.md for the exact data-minimization rules:
// no name/email/password/phone/school-admin/parent data is ever included.
import "server-only";
import { prisma } from "@/lib/prisma";
import type { AICurriculumContext, AIPerformanceContext, AIStudentContext } from "./types";

const MAX_WEAK_TOPICS = 5;
const MAX_STRENGTHS = 5;

/**
 * Base curriculum context from the student's own profile (state/board/
 * class) - always safe to include, no PII. Chapter/topic are added
 * separately only when a specific topic is in play (see
 * resolveTopicContext) so a general question doesn't drag in an arbitrary
 * subject.
 */
async function getBaseCurriculumContext(studentId: string): Promise<AICurriculumContext> {
  const student = await prisma.student.findUnique({
    where: { id: studentId },
    include: { state: true, board: true, schoolClass: true },
  });
  if (!student) return {};
  return {
    state: student.state?.name,
    board: student.board?.shortName,
    className: student.schoolClass?.label,
  };
}

/**
 * Resolves a topicId (as picked from the tutor's Subject/Chapter/Topic
 * selector, or passed in from a "Ask Tutor" link) into curriculum text plus
 * this student's own mastery for it. The topic itself is public curriculum
 * data; the mastery/weak-area lookup is always filtered by studentId, so
 * this can never return another student's progress.
 */
export async function resolveTopicContext(
  topicId: string,
  studentId: string
): Promise<{ curriculum: AICurriculumContext; masteryPct?: number } | null> {
  const topic = await prisma.topic.findUnique({
    where: { id: topicId },
    include: { chapter: { include: { subject: true } } },
  });
  if (!topic) return null;

  const progress = await prisma.studentTopicProgress.findUnique({
    where: { studentId_topicId: { studentId, topicId } },
  });

  return {
    curriculum: {
      subject: topic.chapter.subject.name,
      chapter: topic.chapter.name,
      topic: topic.name,
    },
    masteryPct: progress?.mastery,
  };
}

export async function getStudentPerformanceContext(studentId: string): Promise<AIPerformanceContext> {
  const [weak, strong] = await Promise.all([
    prisma.weaknessProfile.findMany({
      where: { studentId },
      include: { topic: true },
      orderBy: { mastery: "asc" },
      take: MAX_WEAK_TOPICS,
    }),
    prisma.strengthProfile.findMany({
      where: { studentId },
      include: { topic: true },
      orderBy: { mastery: "desc" },
      take: MAX_STRENGTHS,
    }),
  ]);

  return {
    weakTopics: weak.map((w) => w.topic.name),
    strengths: strong.map((s) => s.topic.name),
  };
}

/**
 * Full context for a new conversation. `topicId`, when given, must already
 * be known to belong to a real Topic - the caller (createConversation)
 * doesn't need to re-validate it beyond that, since this function performs
 * no student-supplied trust decisions other than "which topic," and the
 * mastery lookup is inherently scoped to studentId.
 */
export async function buildStudentContext(studentId: string, topicId?: string): Promise<AIStudentContext> {
  const [base, performance] = await Promise.all([getBaseCurriculumContext(studentId), getStudentPerformanceContext(studentId)]);

  let curriculum = base;
  let topicMastery: number | undefined;
  if (topicId) {
    const resolved = await resolveTopicContext(topicId, studentId);
    if (resolved) {
      curriculum = { ...base, ...resolved.curriculum };
      topicMastery = resolved.masteryPct;
    }
  }

  return {
    curriculum,
    performance: { ...performance, masteryPct: topicMastery },
  };
}
