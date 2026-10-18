// Offline tests for what the Performance, Weak Areas and Strengths pages are built from: how topic mastery is worked out (exams AND practice together), when a topic counts as weak or
// strong, how the trend is read, how subject progress and the overall performance numbers are summed, and that one student's results never reach another's. The REAL calculation code runs
// against an in-memory database; no real database or network is involved. Needs Node's module mocking (--experimental-test-module-mocks, as in `npm run test:storage`).
import { test, mock, before } from "node:test";
import assert from "node:assert/strict";

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
  seq: 0,
};
const nid = (p: string) => `${p}${++D.seq}`;
const ts = (iso: string) => new Date(iso);

const pick = <T,>(rows: T[], take?: number) => (take ? rows.slice(0, take) : rows);
const byDateDesc = (a: Date | null, b: Date | null) => (b?.getTime() ?? 0) - (a?.getTime() ?? 0);

const prisma = {
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
    findMany: async ({ where }: Row) => D.submissions.filter((s) => s.studentId === where.studentId && where.status.in.includes(s.status)),
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
