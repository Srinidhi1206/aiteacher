"use server";

// Thin, auth-checked entry points for the student-facing analytics pages -
// the actual calculation lives in lib/analytics/* (Stage E1-E4).
import { prisma } from "@/lib/prisma";
import { requireRole, ForbiddenError } from "@/lib/auth/current-session";
import { getSubjectProgressForStudent, getTopicProgressForStudent } from "@/lib/analytics/progress";
import { getWeakAreasForStudent } from "@/lib/analytics/weakness";
import { getStrengthsForStudent } from "@/lib/analytics/strengths";
import { generateLearningPath, getLearningPathForStudent, setLearningPathItemCompleted } from "@/lib/analytics/learning-path";
import type { ActionResult } from "./materials";

async function requireOwnStudentId(): Promise<string> {
  const session = await requireRole("student");
  const student = await prisma.student.findUnique({ where: { userId: session.id } });
  if (!student) throw new ForbiddenError("Student profile not found.");
  return student.id;
}

export async function getMyProgress() {
  const studentId = await requireOwnStudentId();
  const [subjects, topics] = await Promise.all([getSubjectProgressForStudent(studentId), getTopicProgressForStudent(studentId)]);
  return { subjects, topics };
}

export async function getMyWeakAreas() {
  const studentId = await requireOwnStudentId();
  return getWeakAreasForStudent(studentId);
}

export async function getMyStrengths() {
  const studentId = await requireOwnStudentId();
  return getStrengthsForStudent(studentId);
}

export async function getMyLearningPath() {
  const studentId = await requireOwnStudentId();
  return getLearningPathForStudent(studentId);
}

export async function regenerateMyLearningPath(): Promise<ActionResult> {
  const studentId = await requireOwnStudentId();
  await generateLearningPath(studentId);
  return { ok: true };
}

export async function completeLearningPathItem(itemId: string, completed: boolean): Promise<ActionResult> {
  const studentId = await requireOwnStudentId();
  // Ownership check: the item must belong to a plan owned by this student.
  const item = await prisma.studyPlanItem.findUnique({ where: { id: itemId }, include: { studyPlan: true } });
  if (!item || item.studyPlan.studentId !== studentId) return { ok: false, error: "Item not found." };
  await setLearningPathItemCompleted(itemId, completed);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Stage H: real analytics/reporting - all read-only, all scoped to the
// authenticated student's own studentId, never a client-supplied id.
// ---------------------------------------------------------------------------

export interface OverallPerformance {
  examsAttempted: number;
  examsCompleted: number;
  overallPercentage: number | null; // null when no graded totals exist yet
  averageScorePct: number | null; // average of each exam's own percentage
  totalMarksObtained: number;
  totalMarksAvailable: number;
  strongestSubject: { name: string; averageScore: number } | null;
  weakestSubject: { name: string; averageScore: number } | null;
}

/** Real, persisted-data summary for the /performance overview - see docs/STEP_3_5.md "Stage H detail" for exactly which fields require how much history before they're populated instead of null. */
export async function getMyOverallPerformance(): Promise<OverallPerformance> {
  const studentId = await requireOwnStudentId();

  const submissions = await prisma.examSubmission.findMany({
    where: { studentId, status: { in: ["SUBMITTED", "GRADED"] } },
    select: { totalScore: true, maxScore: true },
  });

  const examsAttempted = await prisma.examSubmission.count({ where: { studentId, status: { not: "NOT_STARTED" } } });
  const examsCompleted = submissions.length;

  const graded = submissions.filter((s) => s.totalScore != null && s.maxScore);
  const totalMarksObtained = graded.reduce((sum, s) => sum + (s.totalScore ?? 0), 0);
  const totalMarksAvailable = graded.reduce((sum, s) => sum + (s.maxScore ?? 0), 0);
  const overallPercentage = totalMarksAvailable > 0 ? Math.round((totalMarksObtained / totalMarksAvailable) * 100) : null;
  const averageScorePct =
    graded.length > 0
      ? Math.round(graded.reduce((sum, s) => sum + (s.totalScore! / s.maxScore!) * 100, 0) / graded.length)
      : null;

  const subjectProgress = await getSubjectProgressForStudent(studentId);
  // Only subjects the student has actually attempted something in (progress
  // is completion-% of topics attempted - 0 means nothing to compare yet).
  const attempted = subjectProgress.filter((s) => s.progress > 0);
  const sorted = [...attempted].sort((a, b) => b.averageScore - a.averageScore);
  const strongestSubject = sorted[0] ? { name: sorted[0].subject.name, averageScore: sorted[0].averageScore } : null;
  const weakestSubject =
    sorted.length > 1 ? { name: sorted[sorted.length - 1].subject.name, averageScore: sorted[sorted.length - 1].averageScore } : null;

  return {
    examsAttempted,
    examsCompleted,
    overallPercentage,
    averageScorePct,
    totalMarksObtained,
    totalMarksAvailable,
    strongestSubject,
    weakestSubject,
  };
}

export interface BloomLevelPerformance {
  bloomLevel: "REMEMBER" | "UNDERSTAND" | "APPLY" | "ANALYZE";
  answerCount: number;
  earnedMarks: number;
  possibleMarks: number;
  percentage: number | null; // null when answerCount is 0
}

const BLOOM_LEVELS: BloomLevelPerformance["bloomLevel"][] = ["REMEMBER", "UNDERSTAND", "APPLY", "ANALYZE"];

/**
 * Performance grouped by each answered question's TOPIC's Bloom
 * classification (ExamQuestion has no Bloom field of its own - see
 * docs/STEP_3_5.md "Stage H detail" for why this is topic-level, not
 * question-level, and the UI must label it that way).
 */
export async function getMyBloomPerformance(): Promise<BloomLevelPerformance[]> {
  const studentId = await requireOwnStudentId();

  const answers = await prisma.examAnswer.findMany({
    where: { marksAwarded: { not: null }, question: { topicId: { not: null } }, submission: { studentId } },
    select: { marksAwarded: true, question: { select: { marks: true, topic: { select: { bloomLevel: true } } } } },
  });

  const buckets = new Map<string, { earned: number; possible: number; count: number }>();
  for (const level of BLOOM_LEVELS) buckets.set(level, { earned: 0, possible: 0, count: 0 });

  for (const a of answers) {
    const level = a.question.topic?.bloomLevel;
    if (!level) continue;
    const bucket = buckets.get(level)!;
    bucket.earned += a.marksAwarded ?? 0;
    bucket.possible += a.question.marks;
    bucket.count += 1;
  }

  return BLOOM_LEVELS.map((level) => {
    const b = buckets.get(level)!;
    return {
      bloomLevel: level,
      answerCount: b.count,
      earnedMarks: b.earned,
      possibleMarks: b.possible,
      percentage: b.possible > 0 ? Math.round((b.earned / b.possible) * 100) : null,
    };
  });
}

export interface HeatmapDayData {
  date: string; // yyyy-mm-dd, server-local calendar day (see docs/STEP_3_5.md date-convention note)
  count: number; // 0-4, capped intensity - real event count that day, not fabricated
}

const HEATMAP_WINDOW_DAYS = 84; // 12 weeks, matching the existing mock Heatmap's stated range
const MAX_HEATMAP_INTENSITY = 4;

function localDayKey(d: Date): number {
  const day = new Date(d);
  day.setHours(0, 0, 0, 0);
  return day.getTime();
}

function localDayLabel(timestamp: number): string {
  const d = new Date(timestamp);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Real activity heatmap derived from three already-persisted, timestamped
 * signals - no dedicated activity-log model exists or was added for this
 * (see docs/STEP_3_5.md "Stage H detail" for why that schema change was
 * judged unnecessary). Every day in the window is returned, including
 * zero-activity days - a real 0 is honest data, not fabrication.
 */
export async function getMyActivityHeatmap(): Promise<{ days: HeatmapDayData[]; hasAnyActivity: boolean }> {
  const studentId = await requireOwnStudentId();

  const windowStart = new Date();
  windowStart.setHours(0, 0, 0, 0);
  windowStart.setDate(windowStart.getDate() - (HEATMAP_WINDOW_DAYS - 1));

  const [examSubmissions, worksheetSubmissions, completedTasks] = await Promise.all([
    prisma.examSubmission.findMany({
      where: { studentId, submittedAt: { gte: windowStart, not: null } },
      select: { submittedAt: true },
    }),
    prisma.worksheetSubmission.findMany({
      where: { studentId, submittedAt: { gte: windowStart, not: null } },
      select: { submittedAt: true },
    }),
    prisma.dailyPlannerTask.findMany({
      where: { studentId, status: "COMPLETED", date: { gte: windowStart } },
      select: { date: true },
    }),
  ]);

  const counts = new Map<number, number>();
  const bump = (d: Date | null) => {
    if (!d) return;
    const key = localDayKey(d);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  };
  examSubmissions.forEach((s) => bump(s.submittedAt));
  worksheetSubmissions.forEach((s) => bump(s.submittedAt));
  completedTasks.forEach((t) => bump(t.date));

  const days: HeatmapDayData[] = [];
  let hasAnyActivity = false;
  for (let i = 0; i < HEATMAP_WINDOW_DAYS; i++) {
    const key = windowStart.getTime() + i * 86_400_000;
    const count = Math.min(MAX_HEATMAP_INTENSITY, counts.get(key) ?? 0);
    if (count > 0) hasAnyActivity = true;
    days.push({ date: localDayLabel(key), count });
  }

  return { days, hasAnyActivity };
}
