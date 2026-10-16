// Generating a student's study plan: loads what the plan is built from (the student's own scope, the exams they are allowed to see, their class's
// subjects and chapters, their weak topics, what they have already done), asks the pure scheduler (exam-plan.ts) what to schedule, and saves it.
// The database handle is a parameter so the whole flow can be tested against an in-memory fake; lib/analytics/learning-path.ts passes the real one.
//
// Saving never throws away the student's history:
//   - the latest plan is KEPT (not deleted and recreated);
//   - completed items are never touched, and neither are items dated before today;
//   - only items dated today or later that are NOT completed are replaced - so generating twice in a row gives the same plan, with no duplicates.
// Everything the plan needs is loaded BEFORE anything is written, and a failed load throws: if the exams cannot be read, the existing plan is left exactly as it
// was (the plan is never rebuilt from an incomplete picture). No AI is used anywhere here.
import type { prisma } from "@/lib/prisma";
import { dayStart, daysBetween, localDateString, todayInIndia } from "@/lib/calendar/day";
import { listUpcomingExams } from "@/lib/calendar/next-exam";
import { buildStudyPlan, type PlanResult } from "./exam-plan";

export type PathDb = Pick<typeof prisma, "student" | "weaknessProfile" | "academicEvent" | "examSchedule" | "schoolClassSubject" | "studyPlan" | "studyPlanItem" | "$transaction">;

export interface PathSummary {
  planId: string | null;
  mode: PlanResult["mode"];
  created: number;
  kept: number;
  notes: string[];
  exams: PlanResult["exams"];
  unscheduled: number;
  coverageNotes: string[];
}


/** Reads everything a plan is built from - and nothing is written. Any failed read throws, so no caller can go on with an incomplete picture. */
async function loadPlanInputs(db: PathDb, studentId: string, now: Date) {
  const student = await db.student.findUnique({ where: { id: studentId }, select: { id: true, schoolId: true, schoolClassId: true, boardId: true } });
  if (!student?.schoolClassId) return null;
  // "Today" is the Indian calendar day, the same one Today's Planner and the next-exam countdown use (lib/calendar/day.ts).
  const today = todayInIndia(now);

  // The class's enabled subjects and their chapters, in textbook order. Nothing else is ever scheduled.
  const links = await db.schoolClassSubject.findMany({
    where: { schoolClassId: student.schoolClassId, isEnabled: true },
    include: { subject: { include: { chapters: { orderBy: { order: "asc" }, select: { id: true, name: true } } } } },
  });
  const subjects = links.map((l) => ({ id: l.subject.id, name: l.subject.name, chapters: l.subject.chapters })).sort((a, b) => a.name.localeCompare(b.name));
  const subjectIds = new Set(subjects.map((s) => s.id));

  const weakRows = await db.weaknessProfile.findMany({
    where: { studentId },
    include: { topic: { include: { chapter: { include: { subject: true } } } } },
    orderBy: { mastery: "asc" },
  });
  const weak = weakRows
    .filter((w) => subjectIds.has(w.topic.chapter.subject.id))
    .map((w) => ({ subjectId: w.topic.chapter.subject.id, subjectName: w.topic.chapter.subject.name, chapterName: w.topic.chapter.name, topicName: w.topic.name, mastery: w.mastery }));

  // Exams: published, own school + board + class only (the same rule as the student Calendar), from the academic calendar and the older schedules.
  const exams = await listUpcomingExams(db, student, today);

  const plan = await db.studyPlan.findFirst({ where: { studentId }, orderBy: { createdAt: "desc" }, include: { items: true } });
  const todayStart = dayStart(today);
  const existing = plan?.items ?? [];
  const kept = existing.filter((i) => i.completed || i.date < todayStart);
  const takenByDate: Record<string, number> = {};
  for (const i of kept) {
    const d = localDateString(i.date);
    takenByDate[d] = (takenByDate[d] ?? 0) + 1;
  }

  return {
    today,
    plan,
    todayStart,
    kept,
    input: {
      today,
      exams,
      subjects,
      weak,
      completedTitles: new Set(existing.filter((i) => i.completed).map((i) => i.title)),
      existingKeys: new Set(kept.map((i) => `${localDateString(i.date)}|${i.title}`)),
      takenByDate,
    },
  };
}

export async function generateLearningPathCore(db: PathDb, studentId: string, now: Date = new Date()): Promise<PathSummary | null> {
  const loaded = await loadPlanInputs(db, studentId, now);
  if (!loaded) return null;
  const { plan, todayStart, kept, input } = loaded;
  const result = buildStudyPlan(input);

  if (!plan && result.items.length === 0) {
    return { planId: null, mode: result.mode, created: 0, kept: 0, notes: result.notes, exams: result.exams, unscheduled: result.unscheduled, coverageNotes: result.coverageNotes };
  }
  const planRow = plan ?? (await db.studyPlan.create({ data: { studentId } }));
  // "Day N" counts from the day the plan was first made, so the numbers stay consistent when it is regenerated.
  const startDay = todayInIndia(planRow.createdAt ?? now);
  const rows = result.items.map((i) => ({
    studyPlanId: planRow.id,
    day: Math.max(1, daysBetween(startDay, i.date) + 1),
    date: dayStart(i.date),
    kind: i.kind,
    subject: i.subject,
    title: i.title,
    durationMinutes: i.durationMinutes,
    priority: i.priority,
  }));
  await db.$transaction([
    db.studyPlanItem.deleteMany({ where: { studyPlanId: planRow.id, completed: false, date: { gte: todayStart } } }),
    db.studyPlanItem.createMany({ data: rows }),
  ]);
  return { planId: planRow.id, mode: result.mode, created: rows.length, kept: kept.length, notes: result.notes, exams: result.exams, unscheduled: result.unscheduled, coverageNotes: result.coverageNotes };
}

/**
 * The notes that say how much of the student's exams the plan can vouch for (for example "based on the published papers for Mathematics"), worked out from the
 * same inputs a regeneration would use. READ ONLY: nothing is written, so the Study Plan page can show them without changing the plan. A failed read throws.
 */
export async function previewCoverageNotesCore(db: PathDb, studentId: string, now: Date = new Date()): Promise<string[]> {
  const loaded = await loadPlanInputs(db, studentId, now);
  if (!loaded) return [];
  return buildStudyPlan(loaded.input).coverageNotes;
}
