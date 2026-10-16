// Learning Path (the student's study plan). The plan itself is built by lib/analytics/exam-plan.ts (pure scheduling) and saved by
// lib/analytics/learning-path-core.ts; this file only hands them the real database. It reuses the existing StudyPlan/StudyPlanItem models
// rather than introducing a second "LearningPath" concept - see docs/STEP_3_5.md's Stage A note on this.
//
// Deterministic and explainable - no AI: exams come from the published academic calendar (and the older exam schedules) for the student's OWN
// school, board and class; chapters come from the class's curriculum; weak topics come from real graded results.
import "server-only";
import { prisma } from "@/lib/prisma";
import { generateLearningPathCore, previewCoverageNotesCore } from "./learning-path-core";

export async function generateLearningPath(studentId: string) {
  return generateLearningPathCore(prisma, studentId);
}

/** What the plan can and cannot vouch for about the student's exams (read only - nothing is written). */
export async function previewCoverageNotes(studentId: string) {
  return previewCoverageNotesCore(prisma, studentId);
}

export async function getLearningPathForStudent(studentId: string) {
  return prisma.studyPlan.findFirst({
    where: { studentId },
    orderBy: { createdAt: "desc" },
    include: { items: { orderBy: { day: "asc" } } },
  });
}

export async function setLearningPathItemCompleted(itemId: string, completed: boolean): Promise<void> {
  await prisma.studyPlanItem.update({ where: { id: itemId }, data: { completed } });
}
