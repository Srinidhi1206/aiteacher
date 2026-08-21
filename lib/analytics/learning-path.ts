// Learning Path generation (Stage E4). Deliberately reuses the existing
// StudyPlan/StudyPlanItem models rather than introducing a second
// "LearningPath" concept - see docs/STEP_3_5.md's Stage A note on this.
//
// Deterministic, explainable scheduling (same ratio-based approach the
// mocked engine already documented in docs/ARCHITECTURE.md used), now
// driven by real weak-area data instead of hand-authored mock data:
//   - Weak topics get priority placement early in the plan.
//   - Remaining subject coverage fills in around them.
//   - Every ~4th day is a practice/revision/buffer day, not new material.
import "server-only";
import { prisma } from "@/lib/prisma";
import { getWeakAreasForStudent } from "./weakness";
import type { StudyPlanItemKind, Priority } from "@prisma/client";

const DEFAULT_PLAN_DAYS = 14;
const MINUTES_PER_TOPIC = 40;
const MINUTES_PER_REVISION = 30;

export async function generateLearningPath(studentId: string) {
  const student = await prisma.student.findUnique({ where: { id: studentId } });
  if (!student?.schoolClassId) return null;

  const weakAreas = await getWeakAreasForStudent(studentId);

  const upcomingSchedule = await prisma.examSchedule.findFirst({
    where: { schoolClassId: student.schoolClassId, isPublished: true, examDate: { gte: new Date() } },
    orderBy: { examDate: "asc" },
  });

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const totalDays = upcomingSchedule
    ? Math.max(3, Math.min(DEFAULT_PLAN_DAYS, Math.ceil((upcomingSchedule.examDate.getTime() - today.getTime()) / 86_400_000)))
    : DEFAULT_PLAN_DAYS;

  // Build a queue: weak topics first (highest priority - what the student
  // most needs), then general subject coverage for subjects with no
  // recorded weak topics, so the plan isn't empty for a student with no
  // graded attempts yet.
  type QueueItem = { subject: string; title: string; kind: StudyPlanItemKind; priority: Priority };
  const queue: QueueItem[] = weakAreas.map((w) => ({
    subject: w.topic.chapter.subject.name,
    title: `Review: ${w.topic.name}`,
    kind: "TOPIC",
    priority: "HIGH",
  }));

  if (queue.length === 0) {
    const subjects = await prisma.subject.findMany({
      where: { schoolClassLinks: { some: { schoolClassId: student.schoolClassId } } },
      take: 6,
    });
    for (const s of subjects) {
      queue.push({ subject: s.name, title: `${s.name}: continue current chapter`, kind: "TOPIC", priority: "MEDIUM" });
    }
  }

  // Delete any existing plan so re-generating doesn't accumulate stale
  // plans - "the" learning path is always the latest one.
  await prisma.studyPlan.deleteMany({ where: { studentId } });
  const plan = await prisma.studyPlan.create({ data: { studentId } });

  const items: { day: number; date: Date; kind: StudyPlanItemKind; subject: string; title: string; durationMinutes: number; priority: Priority }[] = [];
  let queueIndex = 0;
  for (let day = 1; day <= totalDays; day++) {
    const date = new Date(today);
    date.setDate(date.getDate() + (day - 1));

    const isBufferDay = day % 4 === 0;
    if (isBufferDay) {
      items.push({
        day,
        date,
        kind: day % 8 === 0 ? "MOCK_TEST" : "REVISION",
        subject: "All subjects",
        title: day % 8 === 0 ? "Mock test - mixed topics" : "Revision - recap this week's topics",
        durationMinutes: MINUTES_PER_REVISION,
        priority: "MEDIUM",
      });
      continue;
    }

    if (queue.length === 0) continue;
    const next = queue[queueIndex % queue.length];
    queueIndex++;
    items.push({ day, date, kind: next.kind, subject: next.subject, title: next.title, durationMinutes: MINUTES_PER_TOPIC, priority: next.priority });
  }

  if (items.length > 0) {
    await prisma.studyPlanItem.createMany({ data: items.map((i) => ({ ...i, studyPlanId: plan.id })) });
  }

  return prisma.studyPlan.findUnique({ where: { id: plan.id }, include: { items: { orderBy: { day: "asc" } } } });
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
