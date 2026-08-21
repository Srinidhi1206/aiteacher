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
