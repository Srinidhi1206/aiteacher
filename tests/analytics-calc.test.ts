// Offline tests for what the Performance, Weak Areas and Strengths pages are built from: how topic mastery is worked out (exams AND practice together), when a topic counts as weak or
// strong, how the trend is read, how subject progress and the overall performance numbers are summed, and that one student's results never reach another's. The REAL calculation code runs
// against an in-memory database; no real database or network is involved. Needs Node's module mocking (--experimental-test-module-mocks, as in `npm run test:storage`).
import { test, mock, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const here = (p: string) => new URL(`../${p}`, import.meta.url).href;
type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

// ---- the in-memory database ------------------------------------------------------------------------------------------------------------------------------------------
const D = {
  students: { A: { id: "A", userId: "uA", schoolClassId: "c10" }, B: { id: "B", userId: "uB", schoolClassId: "c10" } } as Record<string, Row>,
  topics: [
    { id: "t1", name: "Real Numbers basics", bloomLevel: "REMEMBER", chapterId: "ch1" },
    { id: "t2", name: "Polynomials", bloomLevel: "APPLY", chapterId: "ch2" },
    { id: "t3", name: "Poems", bloomLevel: "UNDERSTAND", chapterId: "ch3" },
  ] as Row[],
  subjects: [
    { id: "maths", name: "Mathematics", chapters: [{ topics: [{ id: "t1" }, { id: "t2" }] }] },
    { id: "eng", name: "English", chapters: [{ topics: [{ id: "t3" }] }] },
  ] as Row[],
  questions: [] as Row[],
  submissions: [] as Row[],
  answers: [] as Row[],
  attempts: [] as Row[],
  scores: [] as Row[],
  topicProgress: [] as Row[],
  subjectProgress: [] as Row[],
  weak: [] as Row[],
  strong: [] as Row[],
  plans: [] as Row[],
  planItems: [] as Row[],
  worksheetSubs: [] as Row[],
  plannerTasks: [] as Row[],
  seq: 0,
};
const nid = (p: string) => `${p}${++D.seq}`;
const ts = (iso: string) => new Date(iso);

const pick = <T,>(rows: T[], take?: number) => (take ? rows.slice(0, take) : rows);
const byDateDesc = (a: Date | null, b: Date | null) => (b?.getTime() ?? 0) - (a?.getTime() ?? 0);

const prisma = {
  worksheetSubmission: { findMany: async ({ where }: Row) => D.worksheetSubs.filter((w) => w.studentId === where.studentId && w.submittedAt >= where.submittedAt.gte) },
  dailyPlannerTask: { findMany: async ({ where }: Row) => D.plannerTasks.filter((t) => t.studentId === where.studentId && t.status === where.status && t.date >= where.date.gte) },
  attempt: { findMany: async ({ where }: Row) => D.attempts.filter((a) => a.studentId === where.studentId && a.createdAt >= where.createdAt.gte) },
  studyPlan: {
    findFirst: async ({ where }: Row) => {
      const p = D.plans.filter((x) => x.studentId === where.studentId).sort((a, b) => b.createdAt - a.createdAt)[0];
      return p ? { ...p, items: D.planItems.filter((i) => i.studyPlanId === p.id).sort((a, b) => a.day - b.day) } : null;
    },
  },
  studyPlanItem: {
    findUnique: async ({ where }: Row) => {
      const i = D.planItems.find((x) => x.id === where.id);
      return i ? { ...i, studyPlan: D.plans.find((p) => p.id === i.studyPlanId) } : null;
    },
    update: async ({ where, data }: Row) => Object.assign(D.planItems.find((x) => x.id === where.id)!, data),
  },
  student: { findUnique: async ({ where }: Row) => (where.userId ? Object.values(D.students).find((s) => s.userId === where.userId) : D.students[where.id]) ?? null },
  topic: {
    findMany: async ({ where }: Row) => D.topics.filter((t) => where.id.in.includes(t.id)).map((t) => ({ id: t.id })),
  },
  subject: { findMany: async () => D.subjects },
  examAnswer: {
    findMany: async ({ where, take, select }: Row) => {
      const rows = D.answers
        .map((a): Row => {
          const question = D.questions.find((q) => q.id === a.questionId)!;
          const submission = D.submissions.find((s) => s.id === a.submissionId)!;
          return { ...a, question: { ...question, topic: D.topics.find((t) => t.id === question.topicId) ?? null }, submission };
        })
        .filter((a) => a.submission.studentId === where.submission.studentId)
        .filter((a) => a.marksAwarded !== null)
        .filter((a) => (where.question.topicId && typeof where.question.topicId === "string" ? a.question.topicId === where.question.topicId : a.question.topicId !== null))
        .sort((a, b) => byDateDesc(a.submission.submittedAt, b.submission.submittedAt));
      void select;
      return pick(rows, take);
    },
  },
  score: {
    findMany: async ({ where, take }: Row) =>
      pick(
        D.scores
          .filter((s) => D.attempts.find((a) => a.id === s.attemptId)!.studentId === where.attempt.studentId && (where.topic === undefined || s.topic === where.topic))
          .map((s) => ({ ...s, attempt: { createdAt: D.attempts.find((a) => a.id === s.attemptId)!.createdAt } }))
          .sort((a, b) => byDateDesc(a.attempt.createdAt, b.attempt.createdAt)),
        take
      ),
  },
  studentTopicProgress: {
    upsert: async ({ where, update, create }: Row) => {
      const k = where.studentId_topicId;
      const found = D.topicProgress.find((p) => p.studentId === k.studentId && p.topicId === k.topicId);
      if (found) return Object.assign(found, update);
      D.topicProgress.push({ ...create });
      return create;
    },
    findMany: async ({ where }: Row) => D.topicProgress.filter((p) => p.studentId === where.studentId && (!where.topicId || where.topicId.in.includes(p.topicId))),
  },
  studentSubjectProgress: {
    upsert: async ({ where, update, create }: Row) => {
      const k = where.studentId_subjectId;
      const found = D.subjectProgress.find((p) => p.studentId === k.studentId && p.subjectId === k.subjectId);
      if (found) return Object.assign(found, update);
      D.subjectProgress.push({ ...create });
      return create;
    },
    findMany: async ({ where }: Row) => D.subjectProgress.filter((p) => p.studentId === where.studentId).map((p): Row => ({ ...p, subject: D.subjects.find((s) => s.id === p.subjectId)! })).sort((a, b) => a.subject.name.localeCompare(b.subject.name)),
  },
  weaknessProfile: profileTable(() => D.weak),
  strengthProfile: profileTable(() => D.strong),
  examSubmission: {
    findMany: async ({ where }: Row) =>
      D.submissions.filter((s) => s.studentId === where.studentId && (where.status ? where.status.in.includes(s.status) : s.submittedAt && s.submittedAt >= where.submittedAt.gte)),
    count: async ({ where }: Row) => D.submissions.filter((s) => s.studentId === where.studentId && s.status !== where.status.not).length,
  },
};
function profileTable(rows: () => Row[]) {
  return {
    upsert: async ({ where, update, create }: Row) => {
      const k = where.studentId_topicId;
      const found = rows().find((p) => p.studentId === k.studentId && p.topicId === k.topicId);
      if (found) return Object.assign(found, update);
      rows().push({ ...create });
      return create;
    },
    deleteMany: async ({ where }: Row) => {
      const keep = rows().filter((p) => !(p.studentId === where.studentId && !where.topicId.notIn.includes(p.topicId)));
      rows().splice(0, rows().length, ...keep);
    },
    findMany: async ({ where }: Row) => rows().filter((p) => p.studentId === where.studentId).map((p) => ({ ...p, topic: D.topics.find((t) => t.id === p.topicId) })),
  };
}

class UnauthorizedError extends Error {}
class ForbiddenError extends Error {}
let who = "uA";
mock.module("server-only", { namedExports: {} });
mock.module(here("lib/prisma.ts"), { namedExports: { prisma } });
mock.module(here("lib/auth/current-session.ts"), { namedExports: { UnauthorizedError, ForbiddenError, requireRole: async () => ({ id: who, role: "student" }) } });

let progress: typeof import("@/lib/analytics/progress");
let weakness: typeof import("@/lib/analytics/weakness");
let strengths: typeof import("@/lib/analytics/strengths");
let actions: typeof import("@/lib/actions/analytics");
before(async () => {
  progress = await import("@/lib/analytics/progress");
  weakness = await import("@/lib/analytics/weakness");
  strengths = await import("@/lib/analytics/strengths");
  actions = await import("@/lib/actions/analytics");
});

// helpers to add results ------------------------------------------------------------------------------------------------------------------------------------------------
function examAnswer(studentId: string, topicId: string | null, marks: number, awarded: number | null, when: string) {
  const q = { id: nid("q"), topicId, marks };
  D.questions.push(q);
  const sub = { id: nid("sub"), studentId, submittedAt: ts(when), status: "GRADED", totalScore: null, maxScore: null };
  D.submissions.push(sub);
  D.answers.push({ id: nid("ans"), submissionId: sub.id, questionId: q.id, marksAwarded: awarded });
}
function practice(studentId: string, topicId: string, correct: boolean, when: string) {
  const at = { id: nid("att"), studentId, createdAt: ts(when) };
  D.attempts.push(at);
  D.scores.push({ id: nid("sc"), attemptId: at.id, topic: topicId, marksScored: correct ? 1 : 0, marksTotal: 1, isCorrect: correct });
}
function reset() {
  for (const k of ["questions", "submissions", "answers", "attempts", "scores", "topicProgress", "subjectProgress", "weak", "strong"] as const) D[k].length = 0;
  who = "uA";
}
const mastery = (studentId: string, topicId: string) => D.topicProgress.find((p) => p.studentId === studentId && p.topicId === topicId);

// ---- mastery ----------------------------------------------------------------------------------------------------------------------------------------------------------

test("mastery is marks earned over marks possible across all graded answers on the topic: 2+0+2 of 6 = 67%", async () => {
  reset();
  examAnswer("A", "t1", 2, 2, "2026-10-01T05:00:00Z");
  examAnswer("A", "t1", 2, 0, "2026-10-02T05:00:00Z");
  examAnswer("A", "t1", 2, 2, "2026-10-03T05:00:00Z");
  await progress.recalculateTopicProgress("A");
  assert.deepEqual([mastery("A", "t1")!.mastery, mastery("A", "t1")!.status], [67, "DEVELOPING"]);
});

test("practice results count toward the same mastery as exams (1 right + 1 wrong practice question join 2 of 2 exam marks: 3 of 4 = 75%)", async () => {
  reset();
  examAnswer("A", "t1", 2, 2, "2026-10-01T05:00:00Z");
  practice("A", "t1", true, "2026-10-02T05:00:00Z");
  practice("A", "t1", false, "2026-10-03T05:00:00Z");
  const touched = await progress.recalculateTopicProgress("A");
  assert.equal(mastery("A", "t1")!.mastery, 75);
  assert.deepEqual(touched, [{ topicId: "t1", masteryPct: 75, attemptCount: 3 }]);
});

test("a written answer the teacher has not marked yet (no marks) is NOT counted - neither as zero nor as full marks", async () => {
  reset();
  examAnswer("A", "t1", 2, 2, "2026-10-01T05:00:00Z");
  examAnswer("A", "t1", 8, null, "2026-10-02T05:00:00Z");
  await progress.recalculateTopicProgress("A");
  assert.equal(mastery("A", "t1")!.mastery, 100);
});

test("questions with no topic, and topics that are not in the curriculum, never get a progress row", async () => {
  reset();
  examAnswer("A", null, 2, 2, "2026-10-01T05:00:00Z");
  examAnswer("A", "ghost-topic", 2, 2, "2026-10-01T05:00:00Z");
  const touched = await progress.recalculateTopicProgress("A");
  assert.deepEqual(touched, []);
  assert.equal(D.topicProgress.length, 0);
});

test("one student's results never reach another student's mastery", async () => {
  reset();
  examAnswer("A", "t1", 2, 0, "2026-10-01T05:00:00Z");
  practice("A", "t1", false, "2026-10-01T05:00:00Z");
  examAnswer("B", "t1", 2, 2, "2026-10-01T05:00:00Z");
  await progress.recalculateTopicProgress("B");
  assert.equal(mastery("B", "t1")!.mastery, 100);
  assert.equal(mastery("A", "t1"), undefined, "A was not even recalculated");
});

// ---- weak and strong --------------------------------------------------------------------------------------------------------------------------------------------------

test("a topic is weak below 50% and only once there are at least 2 results: one bad answer is not a weak area", async () => {
  reset();
  examAnswer("A", "t1", 2, 0, "2026-10-01T05:00:00Z");
  await weakness.recalculateWeakAreas("A");
  assert.equal(D.weak.length, 0, "one result");
  examAnswer("A", "t1", 2, 0, "2026-10-02T05:00:00Z");
  const weak = await weakness.recalculateWeakAreas("A");
  assert.deepEqual(weak.map((w) => [w.topicId, w.mastery, w.wrongAnswers, w.totalAttempts]), [["t1", 0, 2, 2]]);
  assert.match(D.weak[0].reason, /2 of the last 2 attempts were incorrect/);
});

test("exactly 50% is not weak; a topic that recovers drops off the weak list", async () => {
  reset();
  examAnswer("A", "t1", 1, 1, "2026-10-01T05:00:00Z");
  examAnswer("A", "t1", 1, 0, "2026-10-02T05:00:00Z");
  await weakness.recalculateWeakAreas("A");
  assert.equal(D.weak.length, 0, "50% is 'developing'");
  examAnswer("A", "t2", 1, 0, "2026-10-01T05:00:00Z");
  examAnswer("A", "t2", 1, 0, "2026-10-02T05:00:00Z");
  await weakness.recalculateWeakAreas("A");
  assert.deepEqual(D.weak.map((w) => w.topicId), ["t2"]);
  for (let i = 0; i < 6; i++) practice("A", "t2", true, `2026-10-1${i}T05:00:00Z`);
  await weakness.recalculateWeakAreas("A");
  assert.deepEqual(D.weak, [], "6 correct practice answers lifted t2 above 50%");
});

test("a topic is a strength from 80% with at least 3 results; two perfect answers are not yet a strength", async () => {
  reset();
  examAnswer("A", "t1", 1, 1, "2026-10-01T05:00:00Z");
  examAnswer("A", "t1", 1, 1, "2026-10-02T05:00:00Z");
  await strengths.recalculateStrengths("A");
  assert.equal(D.strong.length, 0);
  examAnswer("A", "t1", 1, 1, "2026-10-03T05:00:00Z");
  const strong = await strengths.recalculateStrengths("A");
  assert.deepEqual(strong.map((s) => [s.topicId, s.mastery]), [["t1", 100]]);
  assert.match(D.strong[0].reason, /Consistently high performance across 3 recent assessments \(100% average\)/);
});

test("the trend compares the two most recent results: up by more than 5 points is improving, down is declining, level is stable (history is newest first)", async () => {
  reset();
  practice("A", "t1", true, "2026-10-01T05:00:00Z");
  practice("A", "t1", false, "2026-10-02T05:00:00Z");
  practice("A", "t1", false, "2026-10-03T05:00:00Z");
  practice("A", "t1", false, "2026-10-04T05:00:00Z");
  await weakness.recalculateWeakAreas("A");
  assert.equal(D.weak[0].trend, "STABLE", "the latest two are both wrong (0% and 0%)");
  assert.deepEqual(D.weak[0].trendHistory, [0, 0, 0, 100]);
  practice("A", "t1", true, "2026-10-05T05:00:00Z");
  await weakness.recalculateWeakAreas("A");
  assert.equal(D.weak[0].trend, "IMPROVING", "latest 100%, the one before 0%");
  practice("A", "t1", false, "2026-10-06T05:00:00Z");
  await weakness.recalculateWeakAreas("A");
  assert.equal(D.weak[0].trend, "DECLINING", "latest 0%, the one before 100%");
  assert.deepEqual(D.weak[0].trendHistory, [0, 100, 0, 0, 0]);
});

// ---- subject progress and the overall performance page ------------------------------------------------------------------------------------------------------------

test("subject progress: completion is the share of the subject's topics with any result; the score is the average mastery of those topics", async () => {
  reset();
  examAnswer("A", "t1", 2, 2, "2026-10-01T05:00:00Z");
  examAnswer("A", "t1", 2, 0, "2026-10-02T05:00:00Z");
  await progress.recalculateProgressForStudent("A");
  const maths = D.subjectProgress.find((p) => p.studentId === "A" && p.subjectId === "maths")!;
  assert.deepEqual([maths.progress, maths.averageScore], [50, 50], "1 of 2 topics attempted, mastery 50%");
  const eng = D.subjectProgress.find((p) => p.studentId === "A" && p.subjectId === "eng")!;
  assert.deepEqual([eng.progress, eng.averageScore], [0, 0]);
});

test("overall performance: percentages use only submissions that already have a final score; pending exams count as completed but add no marks; strongest/weakest need two attempted subjects", async () => {
  reset();
  D.submissions.push(
    { id: "s1", studentId: "A", status: "GRADED", totalScore: 8, maxScore: 10, submittedAt: ts("2026-10-01T05:00:00Z") },
    { id: "s2", studentId: "A", status: "SUBMITTED", totalScore: 3, maxScore: 10, submittedAt: ts("2026-10-02T05:00:00Z") },
    { id: "s3", studentId: "A", status: "SUBMITTED", totalScore: null, maxScore: 10, submittedAt: ts("2026-10-03T05:00:00Z") }, // written answers still to be marked
    { id: "s4", studentId: "A", status: "IN_PROGRESS", totalScore: null, maxScore: null, submittedAt: null },
    { id: "s5", studentId: "A", status: "NOT_STARTED", totalScore: null, maxScore: null, submittedAt: null },
    { id: "s6", studentId: "B", status: "GRADED", totalScore: 10, maxScore: 10, submittedAt: ts("2026-10-01T05:00:00Z") }
  );
  who = "uA";
  let perf = await actions.getMyOverallPerformance();
  assert.deepEqual([perf.examsAttempted, perf.examsCompleted], [4, 3], "started 4 (not the NOT_STARTED one), handed in 3");
  assert.deepEqual([perf.totalMarksObtained, perf.totalMarksAvailable, perf.overallPercentage, perf.averageScorePct], [11, 20, 55, 55], "(8+3)/(10+10); the pending one is left out");
  assert.deepEqual([perf.strongestSubject, perf.weakestSubject], [null, null], "no subject progress yet");
  D.subjectProgress.push({ studentId: "A", subjectId: "maths", progress: 50, averageScore: 70 });
  perf = await actions.getMyOverallPerformance();
  assert.deepEqual([perf.strongestSubject?.name, perf.weakestSubject], ["Mathematics", null], "one subject: no 'weakest' to compare with");
  D.subjectProgress.push({ studentId: "A", subjectId: "eng", progress: 100, averageScore: 40 });
  perf = await actions.getMyOverallPerformance();
  assert.deepEqual([perf.strongestSubject?.name, perf.weakestSubject?.name], ["Mathematics", "English"]);
  who = "uB";
  assert.equal((await actions.getMyOverallPerformance()).totalMarksObtained, 10, "B sees only B's marks");
});

test("a student with no exams gets honest nulls, not zeros dressed up as percentages", async () => {
  reset();
  const perf = await actions.getMyOverallPerformance();
  assert.deepEqual([perf.examsAttempted, perf.examsCompleted, perf.overallPercentage, perf.averageScorePct], [0, 0, null, null]);
});

test("performance by Bloom level groups graded answers by their topic's level, with null (not 0%) where there are none, and ignores unmarked answers", async () => {
  reset();
  examAnswer("A", "t1", 2, 2, "2026-10-01T05:00:00Z"); // REMEMBER
  examAnswer("A", "t1", 2, 1, "2026-10-02T05:00:00Z"); // REMEMBER
  examAnswer("A", "t2", 4, 1, "2026-10-02T05:00:00Z"); // APPLY
  examAnswer("A", "t2", 4, null, "2026-10-02T05:00:00Z"); // not marked yet
  const bloom = await actions.getMyBloomPerformance();
  const byLevel = Object.fromEntries(bloom.map((b) => [b.bloomLevel, b]));
  assert.deepEqual([byLevel.REMEMBER.answerCount, byLevel.REMEMBER.percentage], [2, 75]);
  assert.deepEqual([byLevel.APPLY.answerCount, byLevel.APPLY.percentage], [1, 25]);
  assert.deepEqual([byLevel.UNDERSTAND.percentage, byLevel.ANALYZE.percentage], [null, null]);
});

// ---- the study plan the student sees: day keys and progress ownership -------------------------------------------------------------------------------------------------------

test("every plan task the page receives carries its day as a plain yyyy-mm-dd, read the way it was stored (server-local midnight), in any server zone", async () => {
  reset();
  D.plans.push({ id: "p1", studentId: "A", createdAt: 1 });
  D.planItems.push({ id: "i1", studyPlanId: "p1", day: 1, date: new Date("2026-10-16T00:00:00"), completed: false, title: "Study: A" }, { id: "i2", studyPlanId: "p1", day: 2, date: new Date("2026-10-17T00:00:00"), completed: true, title: "Study: B" });
  const plan = await actions.getMyLearningPath();
  assert.deepEqual(plan!.items.map((i) => i.dateKey), ["2026-10-16", "2026-10-17"]);
  who = "uB";
  assert.equal(await actions.getMyLearningPath(), null, "another student has no plan of their own, and never sees A's");
  who = "uA";
});

test("a student can tick only their OWN plan tasks: someone else's task, or one that does not exist, is 'not found' and unchanged", async () => {
  reset();
  D.plans.push({ id: "p1", studentId: "A", createdAt: 1 });
  D.planItems.push({ id: "i1", studyPlanId: "p1", day: 1, date: new Date("2026-10-16T00:00:00"), completed: false, title: "Study: A" });
  who = "uB";
  assert.deepEqual(await actions.completeLearningPathItem("i1", true), { ok: false, error: "Item not found." });
  assert.deepEqual(await actions.completeLearningPathItem("ghost", true), { ok: false, error: "Item not found." });
  assert.equal(D.planItems[0].completed, false);
  who = "uA";
  assert.deepEqual(await actions.completeLearningPathItem("i1", true), { ok: true });
  assert.equal(D.planItems[0].completed, true);
  assert.deepEqual(await actions.completeLearningPathItem("i1", false), { ok: true });
  assert.equal(D.planItems[0].completed, false, "and it can be un-ticked");
});

// ---- the activity heatmap: Indian calendar days -------------------------------------------------------------------------------------------------------------------------------
// The clock is fixed (18 Oct 2026, 13:34 IST = 08:04 UTC) so nothing here depends on when the tests run, and the suite is run with the server in several zones.
import { dayStart, todayWindow } from "@/lib/calendar/day";
const NOW_ISO = "2026-10-18T08:04:00Z";
function withClock<T>(run: () => Promise<T>): Promise<T> {
  mock.timers.enable({ apis: ["Date"], now: new Date(NOW_ISO) });
  return run().finally(() => mock.timers.reset());
}
const heatmapReset = () => {
  reset();
  D.worksheetSubs.length = 0;
  D.plannerTasks.length = 0;
};
const lit = (days: { date: string; count: number }[]) => Object.fromEntries(days.filter((d) => d.count > 0).map((d) => [d.date, d.count]));
const attempt = (studentId: string, iso: string) => practice(studentId, "t1", true, iso);

test("a practice session submitted at 13:34 IST on 18 Oct lights 18 Oct, and the page is not empty", async () => {
  heatmapReset();
  attempt("A", NOW_ISO);
  const r = await withClock(() => actions.getMyActivityHeatmap());
  assert.deepEqual(lit(r.days), { "2026-10-18": 1 });
  assert.equal(r.hasAnyActivity, true);
});

test("the day changes at midnight INDIA time, not UTC: 23:59:59 IST on the 17th is the 17th, 00:00:00 IST on the 18th is the 18th", async () => {
  heatmapReset();
  attempt("A", "2026-10-17T18:29:59Z");
  attempt("A", "2026-10-17T18:30:00Z");
  attempt("A", "2026-10-17T21:30:00Z"); // 03:00 IST on the 18th - on a UTC server this used to land on the 17th
  const r = await withClock(() => actions.getMyActivityHeatmap());
  assert.deepEqual(lit(r.days), { "2026-10-17": 1, "2026-10-18": 2 });
});

test("exams and assignments are placed by the Indian day they were handed in, too", async () => {
  heatmapReset();
  D.submissions.push({ id: "e1", studentId: "A", status: "SUBMITTED", submittedAt: new Date("2026-10-17T21:30:00Z") });
  D.worksheetSubs.push({ studentId: "A", submittedAt: new Date("2026-10-17T18:29:59Z") });
  const r = await withClock(() => actions.getMyActivityHeatmap());
  assert.deepEqual(lit(r.days), { "2026-10-17": 1, "2026-10-18": 1 });
});

// ---- planner tasks: the dashboard's day, in every server zone ---------------------------------------------------------------------------------------------------------------------
// A planner task is stored as the start of its day in the SERVER's zone (lib/calendar/day.ts), and the dashboard's "Today's Planner" (todayWindow) finds today's tasks by the window
// [start of the Indian date, start of the next] in that same zone. The heatmap must put a task on exactly the day the dashboard would show it on, so it reads the stored date the same
// way - NOT as an Indian wall-clock time, which would disagree with the dashboard for any task not stored as a day start. The zone is switched inside each test, so the answer is shown
// to be the same wherever the server runs (the whole suite is also run with TZ set to each of these).
const ZONES = ["UTC", "Asia/Kolkata", "PST8PDT", "EST5EDT"];
async function inZone<T>(tz: string, run: () => Promise<T>): Promise<T> {
  const before = process.env.TZ;
  process.env.TZ = tz;
  try {
    return await run();
  } finally {
    if (before === undefined) delete process.env.TZ;
    else process.env.TZ = before;
  }
}
const planned = (date: Date, status = "COMPLETED", studentId = "A") => ({ studentId, status, date });
const heat = () => withClock(() => actions.getMyActivityHeatmap());
/** The Indian date whose dashboard "today" window (todayWindow) contains this moment, as the server in its current zone sees it. */
const dashboardDay = (moment: Date): string | null => {
  for (const d of ["2026-07-26", "2026-07-27", "2026-10-16", "2026-10-17", "2026-10-18", "2026-10-19"]) {
    const w = todayWindow(new Date(`${d}T06:30:00Z`)); // noon IST on that date
    if (w.today === d && w.start.getTime() <= moment.getTime() && moment.getTime() < w.end.getTime()) return d;
  }
  return null;
};

test("a planner task stored as the start of its day lands on that day in every server zone, and only COMPLETED ones count", async () => {
  for (const tz of ZONES) {
    await inZone(tz, async () => {
      heatmapReset();
      D.plannerTasks.push(planned(dayStart("2026-10-17")), planned(dayStart("2026-10-18")), planned(dayStart("2026-10-16"), "TODO"), planned(dayStart("2026-10-15"), "SKIPPED"));
      const r = await heat();
      assert.deepEqual(lit(r.days), { "2026-10-17": 1, "2026-10-18": 1 }, tz);
    });
  }
});

test("a planner task between 00:00 and 05:30 IST is on the day the dashboard shows it on, in every server zone - and that day is pinned, zone by zone", async () => {
  // 02:00 IST on 18 Oct is 20:30Z on the 17th: a server in UTC or the Americas holds it on its 17th, one in Kolkata on the 18th - the dashboard and the heatmap say the same thing either way.
  const expected: Record<string, string> = { UTC: "2026-10-17", "Asia/Kolkata": "2026-10-18", PST8PDT: "2026-10-17", EST5EDT: "2026-10-17" };
  const moments = ["2026-10-17T18:30:00Z", "2026-10-17T20:30:00Z", "2026-10-17T23:59:59Z", "2026-10-18T00:00:00Z", "2026-10-18T08:00:00Z"];
  for (const tz of ZONES) {
    for (const iso of moments) {
      await inZone(tz, async () => {
        heatmapReset();
        D.plannerTasks.push(planned(new Date(iso)));
        const lights = Object.keys(lit((await heat()).days));
        assert.equal(lights.length, 1, `${tz} ${iso}`);
        assert.equal(lights[0], dashboardDay(new Date(iso)), `${tz} ${iso}: the heatmap day is the dashboard's day`);
      });
    }
    await inZone(tz, async () => {
      heatmapReset();
      D.plannerTasks.push(planned(new Date("2026-10-17T20:30:00Z")));
      assert.deepEqual(Object.keys(lit((await heat()).days)), [expected[tz]], `${tz}: a task at 02:00 IST on the 18th`);
    });
  }
});

test("the day a task is stored as (the start of its day) is the day the dashboard shows it on, in every zone: no task is shifted by the server's zone", async () => {
  for (const tz of ZONES) {
    await inZone(tz, async () => {
      for (const d of ["2026-10-16", "2026-10-17", "2026-10-18"]) {
        heatmapReset();
        D.plannerTasks.push(planned(dayStart(d)));
        assert.equal(dashboardDay(dayStart(d)), d, `${tz} ${d}: the dashboard`);
        assert.deepEqual(lit((await heat()).days), { [d]: 1 }, `${tz} ${d}: the heatmap`);
      }
    });
  }
});

test("the window's lower bound and the day placement agree at the first day's midnight: nothing missed, nothing counted twice, in every server zone", async () => {
  for (const tz of ZONES) {
    await inZone(tz, async () => {
      heatmapReset();
      const firstStart = dayStart("2026-07-27");
      D.plannerTasks.push(
        planned(firstStart), //                                    the first day, stored as a day start
        planned(new Date(firstStart.getTime() + 1)), //            a moment into it
        planned(new Date(firstStart.getTime() - 1)), //            the last moment of the day before: outside
        planned(dayStart("2026-07-26")) //                         the day before the window
      );
      assert.deepEqual(lit((await heat()).days), { "2026-07-27": 2 }, tz);
      heatmapReset();
      const today = dayStart("2026-10-18");
      D.plannerTasks.push(planned(new Date(today.getTime() - 1)), planned(today));
      const r = await heat();
      assert.deepEqual(lit(r.days), { "2026-10-17": 1, "2026-10-18": 1 }, tz);
      assert.equal(r.days.reduce((a, d) => a + d.count, 0), 2, "two tasks, two counts");
    });
  }
});

test("another student's planner task is never counted, whatever its time or the server's zone", async () => {
  for (const tz of ZONES) {
    await inZone(tz, async () => {
      heatmapReset();
      D.plannerTasks.push(planned(new Date("2026-10-17T20:30:00Z"), "COMPLETED", "B"), planned(dayStart("2026-10-18"), "COMPLETED", "B"));
      const r = await heat();
      assert.equal(r.hasAnyActivity, false, tz);
    });
  }
});

test("the window is exactly 84 Indian days ending today: 27 Jul to 18 Oct, consecutive, one cell per day", async () => {
  heatmapReset();
  const r = await withClock(() => actions.getMyActivityHeatmap());
  assert.equal(r.days.length, 84);
  assert.equal(r.days[0].date, "2026-07-27");
  assert.equal(r.days[83].date, "2026-10-18");
  const keys = r.days.map((d) => d.date);
  assert.equal(new Set(keys).size, 84, "no day twice (daylight saving cannot repeat or skip one)");
  for (let i = 1; i < keys.length; i++) assert.equal((Date.parse(keys[i]) - Date.parse(keys[i - 1])) / 86_400_000, 1, `${keys[i - 1]} -> ${keys[i]}`);
});

test("the first moment of the window is 00:00 IST on 27 Jul: a session 1 second earlier is outside, at that moment it is the first cell", async () => {
  heatmapReset();
  attempt("A", "2026-07-26T18:29:59Z");
  attempt("A", "2026-07-26T18:30:00Z");
  const r = await withClock(() => actions.getMyActivityHeatmap());
  assert.deepEqual(lit(r.days), { "2026-07-27": 1 });
});

test("a session from 100 days ago is outside the window, and with nothing else the page is honestly empty", async () => {
  heatmapReset();
  attempt("A", "2026-07-10T08:00:00Z");
  const r = await withClock(() => actions.getMyActivityHeatmap());
  assert.deepEqual(lit(r.days), {});
  assert.equal(r.hasAnyActivity, false);
});

test("a day's intensity is capped at 4 however many things happened, and the four kinds of activity add up", async () => {
  heatmapReset();
  for (let i = 0; i < 6; i++) attempt("A", NOW_ISO);
  const first = await withClock(() => actions.getMyActivityHeatmap());
  assert.deepEqual(lit(first.days), { "2026-10-18": 4 });
  heatmapReset();
  attempt("A", NOW_ISO);
  D.submissions.push({ id: "e1", studentId: "A", status: "SUBMITTED", submittedAt: new Date(NOW_ISO) });
  D.worksheetSubs.push({ studentId: "A", submittedAt: new Date(NOW_ISO) });
  D.plannerTasks.push({ studentId: "A", status: "COMPLETED", date: dayStart("2026-10-18") });
  const mixed = await withClock(() => actions.getMyActivityHeatmap());
  assert.deepEqual(lit(mixed.days), { "2026-10-18": 4 });
});

test("only the signed-in student's own activity counts: another student's attempt, exam, assignment and planner task never light a cell", async () => {
  heatmapReset();
  attempt("B", NOW_ISO);
  D.submissions.push({ id: "e2", studentId: "B", status: "SUBMITTED", submittedAt: new Date(NOW_ISO) });
  D.worksheetSubs.push({ studentId: "B", submittedAt: new Date(NOW_ISO) });
  D.plannerTasks.push({ studentId: "B", status: "COMPLETED", date: dayStart("2026-10-18") });
  const r = await withClock(() => actions.getMyActivityHeatmap());
  assert.deepEqual(lit(r.days), {});
  assert.equal(r.hasAnyActivity, false);
});

test("a practice session that was started but never submitted leaves no attempt row, so it lights nothing", async () => {
  heatmapReset();
  const r = await withClock(() => actions.getMyActivityHeatmap());
  assert.equal(r.hasAnyActivity, false);
});

test("the Performance card describes what is counted - including practice - and says Study Plan ticks are not", () => {
  const page = fs.readFileSync(new URL("../app/(app)/performance/page.tsx", import.meta.url), "utf8");
  assert.match(page, /exams submitted, assignments handed in, practice sessions finished and planner tasks completed\. Study Plan ticks are not counted\./);
  assert.ok(!/hidden sm:block">12 weeks/.test(page), "the description is no longer hidden on phones");
});
