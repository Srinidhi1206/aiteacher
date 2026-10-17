// Offline tests for the student journeys that save something: handing in an assignment (E), taking and submitting an exam and reading the result (C), and a practice
// session with its score and explanations (F). The REAL server actions run against an in-memory database: who may open what, what the browser is never given, how a score is
// worked out, and what a repeat or a failure does. No real database, network or AI is involved. Needs Node's module mocking (--experimental-test-module-mocks).
import { test, mock, before } from "node:test";
import assert from "node:assert/strict";
import { Prisma } from "@prisma/client";

const here = (p: string) => new URL(`../${p}`, import.meta.url).href;

// ---- the in-memory database --------------------------------------------------------------------------------------------------------------------------------------------
type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const T = {
  students: {
    a: { id: "stuA", userId: "uA", schoolId: "demo", schoolClassId: "c10", boardId: "bse" },
    b: { id: "stuB", userId: "uB", schoolId: "demo", schoolClassId: "c10", boardId: "bse" },
    far: { id: "stuF", userId: "uF", schoolId: "other", schoolClassId: "c10", boardId: "bse" },
    nine: { id: "stuN", userId: "uN", schoolId: "demo", schoolClassId: "c9", boardId: "bse" },
  } as Record<string, Row>,
  teachers: { t1: { id: "t1", userId: "tu1", schoolId: "demo" } } as Record<string, Row>,
  subjects: { maths: { id: "maths", name: "Mathematics" } } as Record<string, Row>,
  exams: [] as Row[],
  questions: [] as Row[],
  submissions: [] as Row[],
  answers: [] as Row[],
  worksheets: [] as Row[],
  wsSubs: [] as Row[],
  papers: [] as Row[],
  paperQuestions: [] as Row[],
  bank: [] as Row[],
  attempts: [] as Row[],
  notifications: [] as { userId: string; title: string; message: string }[],
  analyticsCalls: 0,
  analyticsFail: false,
  txOptions: [] as unknown[],
  beforeTx: null as null | (() => void),
  txError: null as null | Error,
  seq: 0,
};
const id = (p: string) => `${p}${++T.seq}`;
const studentByUser = (userId: string) => Object.values(T.students).find((s) => s.userId === userId) ?? null;

const prisma = {
  student: { findUnique: async ({ where }: Row) => (where.userId ? studentByUser(where.userId) : Object.values(T.students).find((s) => s.id === where.id) ?? null) },
  teacher: { findUnique: async ({ where }: Row) => T.teachers[where.id] ?? Object.values(T.teachers).find((t) => t.id === where.id) ?? null },
  user: { findUnique: async ({ where }: Row) => ({ name: where.id === "uA" ? "Asha" : "Someone" }) },
  exam: {
    findMany: async ({ where }: Row) =>
      T.exams
        .filter((e) => e.schoolClassId === where.schoolClassId && e.status === where.status && T.teachers[e.teacherId].schoolId === where.teacher.schoolId)
        .map((e) => ({ ...e, subject: T.subjects[e.subjectId], submissions: T.submissions.filter((s) => s.examId === e.id && s.studentId === where.__student) })),
    findUnique: async ({ where }: Row) => {
      const e = T.exams.find((x) => x.id === where.id);
      return e ? { ...e, subject: T.subjects[e.subjectId], teacher: { schoolId: T.teachers[e.teacherId].schoolId }, questions: T.questions.filter((q) => q.examId === e.id).sort((a, b) => a.order - b.order) } : null;
    },
  },
  examQuestion: { findUnique: async ({ where }: Row) => T.questions.find((q) => q.id === where.id) ?? null },
  examSubmission: {
    findUnique: async ({ where }: Row) => {
      const s = where.id ? T.submissions.find((x) => x.id === where.id) : T.submissions.find((x) => x.examId === where.examId_studentId.examId && x.studentId === where.examId_studentId.studentId);
      if (!s) return null;
      const exam = T.exams.find((e) => e.id === s.examId)!;
      return { ...s, exam: { ...exam, questions: T.questions.filter((q) => q.examId === exam.id), subject: T.subjects[exam.subjectId] }, answers: T.answers.filter((a) => a.submissionId === s.id).map((a) => ({ ...a, question: T.questions.find((q) => q.id === a.questionId) })), grade: null };
    },
    upsert: async ({ where, update, create }: Row) => {
      const k = where.examId_studentId;
      const found = T.submissions.find((x) => x.examId === k.examId && x.studentId === k.studentId);
      if (found) return Object.assign(found, update);
      const row = { id: id("sub"), totalScore: null, maxScore: null, submittedAt: null, ...create };
      T.submissions.push(row);
      return row;
    },
    update: async ({ where, data }: Row) => Object.assign(T.submissions.find((x) => x.id === where.id)!, data),
    // A conditional write, like the database's: it changes the row only if it is still in one of the listed states, and says whether it did.
    updateMany: async ({ where, data }: Row) => {
      const hit = T.submissions.find((x) => x.id === where.id && where.status.in.includes(x.status));
      if (!hit) return { count: 0 };
      Object.assign(hit, data);
      return { count: 1 };
    },
    findMany: async ({ where }: Row) => T.submissions.filter((s) => s.studentId === where.studentId && where.status.in.includes(s.status)).map((s) => ({ ...s, exam: { ...T.exams.find((e) => e.id === s.examId)!, subject: T.subjects.maths } })),
  },
  examAnswer: {
    findMany: async ({ where }: Row) => T.answers.filter((a) => a.submissionId === where.submissionId),
    upsert: async ({ where, update, create }: Row) => {
      const k = where.submissionId_questionId;
      const found = T.answers.find((a) => a.submissionId === k.submissionId && a.questionId === k.questionId);
      if (found) return Object.assign(found, update);
      const row = { id: id("ans"), studentAnswer: null, isCorrect: null, marksAwarded: null, ...create };
      T.answers.push(row);
      return row;
    },
  },
  worksheet: {
    findUnique: async ({ where }: Row) => {
      const w = T.worksheets.find((x) => x.id === where.id);
      return w ? { ...w, teacher: { schoolId: T.teachers[w.teacherId].schoolId, userId: T.teachers[w.teacherId].userId } } : null;
    },
  },
  worksheetSubmission: {
    findUnique: async ({ where }: Row) => T.wsSubs.find((s) => s.worksheetId === where.worksheetId_studentId.worksheetId && s.studentId === where.worksheetId_studentId.studentId) ?? null,
    upsert: async ({ where, update, create }: Row) => {
      const k = where.worksheetId_studentId;
      const found = T.wsSubs.find((s) => s.worksheetId === k.worksheetId && s.studentId === k.studentId);
      if (found) return Object.assign(found, update);
      const row = { id: id("ws"), score: null, ...create };
      T.wsSubs.push(row);
      return row;
    },
  },
  paper: {
    findUnique: async ({ where }: Row) => {
      const p = T.papers.find((x) => x.id === where.id);
      if (!p) return null;
      return {
        ...p,
        questions: T.paperQuestions.filter((pq) => pq.paperId === p.id).sort((a, b) => a.order - b.order).map((pq) => ({ ...pq, question: T.bank.find((q) => q.id === pq.questionId) })),
        attempts: T.attempts.filter((a) => a.paperId === p.id && (!a.__owner || true)).map((a) => ({ ...a })),
      };
    },
  },
  attempt: {
    count: async ({ where }: Row) => T.attempts.filter((a) => a.paperId === where.paperId && a.studentId === where.studentId).length,
    create: async ({ data }: Row) => {
      const { scores, ...rest } = data;
      const row = { id: id("att"), createdAt: new Date("2026-10-17T06:00:00Z"), ...rest, scores: scores?.create ?? [] };
      T.attempts.push(row);
      return row;
    },
  },
  // An interactive transaction: the callback gets a handle with the same attempt table. `beforeTx` lets a test slip another request's write in between the caller's
  // earlier read and its transaction; `txError` makes the database abort it (as Serializable does for the loser of two overlapping ones).
  $transaction: async (fn: (tx: unknown) => Promise<unknown>, opts?: unknown) => {
    T.txOptions.push(opts);
    T.beforeTx?.();
    if (T.txError) throw T.txError;
    return fn({ attempt: { count: (a: Row) => prisma.attempt.count(a), create: (a: Row) => prisma.attempt.create(a) } });
  },
};

// ---- mocks ----------------------------------------------------------------------------------------------------------------------------------------------------------------
class UnauthorizedError extends Error {}
class ForbiddenError extends Error {}
let session: { id: string; role: string; name: string } | null = { id: "uA", role: "student", name: "Asha" };
mock.module("server-only", { namedExports: {} });
mock.module(here("lib/prisma.ts"), { namedExports: { prisma } });
mock.module(here("lib/auth/current-session.ts"), {
  namedExports: {
    UnauthorizedError,
    ForbiddenError,
    getCurrentSession: async () => session,
    requireRole: async (role: string) => {
      if (!session) throw new UnauthorizedError("You must be signed in.");
      if (session.role !== role) throw new ForbiddenError("Not allowed.");
      return session;
    },
  },
});
mock.module(here("lib/notifications/core.ts"), {
  namedExports: {
    notifyUserQuietly: async (userId: string, c: { title: string; message: string }) => void T.notifications.push({ userId, ...c }),
    notifyQuietly: async () => undefined,
    audienceForClassInSchool: () => ({}),
  },
});
mock.module(here("lib/audit.ts"), { namedExports: { logAudit: async () => undefined } });
mock.module(here("lib/academics/acting.ts"), { namedExports: { resolveAuthor: async () => null, canManageAuthored: async () => false, actingNote: () => "" } });
mock.module(here("lib/storage/index.ts"), { namedExports: { storage: {}, validateUploadFile: () => null, safeFilename: (n: string) => n, StorageNotConfiguredError: class extends Error {} } });
mock.module(here("lib/storage/errors.ts"), { namedExports: { isStorageBlocked: () => false } });
mock.module(here("lib/storage/stop-messages.ts"), { namedExports: { STORAGE_BLOCKED_MESSAGE: "blocked" } });
const analytics = async () => {
  T.analyticsCalls++;
  if (T.analyticsFail) throw new Error("analytics down");
};
mock.module(here("lib/analytics/progress.ts"), { namedExports: { recalculateProgressForStudent: analytics } });
mock.module(here("lib/analytics/weakness.ts"), { namedExports: { recalculateWeakAreas: async () => undefined } });
mock.module(here("lib/analytics/strengths.ts"), { namedExports: { recalculateStrengths: async () => undefined } });
mock.module(here("lib/ai/index.ts"), { namedExports: { getAIProvider: () => null, AIError: class extends Error { code = "x"; } } });

let exams: typeof import("@/lib/actions/exams");
let worksheets: typeof import("@/lib/actions/worksheets");
let practice: typeof import("@/lib/actions/practice");
before(async () => {
  exams = await import("@/lib/actions/exams");
  worksheets = await import("@/lib/actions/worksheets");
  practice = await import("@/lib/actions/practice");
});
const as = (userId: string, role = "student") => void (session = { id: userId, role, name: userId === "uA" ? "Asha" : userId });

// ---- E. assignments ---------------------------------------------------------------------------------------------------------------------------------------------------
function worksheet(over: Row = {}) {
  const w = { id: id("w"), title: "Algebra sheet", isPublished: true, schoolClassId: "c10", teacherId: "t1", ...over };
  T.worksheets.push(w);
  return w;
}

test("E: a student hands in an assignment of their own school and class; the teacher is told once; handing in again does not tell them again", async () => {
  as("uA");
  const w = worksheet();
  T.notifications.length = 0;
  assert.deepEqual(await worksheets.submitWorksheet(w.id), { ok: true });
  assert.equal(T.wsSubs.filter((s) => s.worksheetId === w.id && s.studentId === "stuA").length, 1);
  assert.equal(T.notifications.length, 1);
  assert.match(T.notifications[0].message, /handed in "Algebra sheet"/);
  assert.equal(T.notifications[0].userId, "tu1", "the teacher who set it");
  assert.deepEqual(await worksheets.submitWorksheet(w.id), { ok: true });
  assert.equal(T.wsSubs.filter((s) => s.worksheetId === w.id && s.studentId === "stuA").length, 1, "still one submission row");
  assert.equal(T.notifications.length, 1, "a repeat is not news");
});

test("E: an assignment that is unpublished, for another class, or from another school cannot be handed in - and says only 'not found'", async () => {
  const draft = worksheet({ isPublished: false });
  const otherClass = worksheet({ schoolClassId: "c9" });
  const mine = worksheet();
  for (const [who, w] of [["uA", draft], ["uA", otherClass], ["uF", mine], ["uN", mine]] as const) {
    as(who);
    assert.deepEqual(await worksheets.submitWorksheet(w.id), { ok: false, error: "Worksheet not found." }, `${who} / ${w.id}`);
  }
  assert.deepEqual(await worksheets.submitWorksheet("no-such"), { ok: false, error: "Worksheet not found." });
  assert.equal(T.wsSubs.some((s) => s.worksheetId === draft.id || s.worksheetId === otherClass.id), false);
});

test("E: once a teacher has graded it, handing in again cannot change it", async () => {
  as("uB");
  const w = worksheet();
  T.wsSubs.push({ id: id("ws"), worksheetId: w.id, studentId: "stuB", score: 8, submittedAt: new Date("2026-10-01T00:00:00Z") });
  const r = await worksheets.submitWorksheet(w.id);
  assert.deepEqual(r, { ok: false, error: "This assignment has already been graded." });
  assert.equal(T.wsSubs.find((s) => s.worksheetId === w.id)!.submittedAt.toISOString(), "2026-10-01T00:00:00.000Z");
});

test("E: only a signed-in student can hand in; the student list shows only their own school and class", async () => {
  const w = worksheet();
  session = null;
  assert.equal((await worksheets.submitWorksheet(w.id)).ok, false);
  as("tu1", "teacher");
  assert.equal((await worksheets.submitWorksheet(w.id)).ok, false);
});

// ---- C. exams -----------------------------------------------------------------------------------------------------------------------------------------------------------
function exam(questions: Row[], over: Row = {}) {
  const e = { id: id("exam"), title: "Unit Test", status: "PUBLISHED", schoolClassId: "c10", teacherId: "t1", subjectId: "maths", durationMinutes: 30, maxMarks: 10, instructions: null, createdAt: new Date(), ...over };
  T.exams.push(e);
  questions.forEach((q, i) => T.questions.push({ id: id("q"), examId: e.id, order: i, options: null, correctAnswer: null, ...q }));
  return { e, qs: T.questions.filter((q) => q.examId === e.id) };
}
const MCQ = (marks = 2) => ({ type: "MCQ", prompt: "2+2?", options: ["3", "4"], correctAnswer: "4", marks });

test("C: the student receives the questions WITHOUT the answer key", async () => {
  as("uA");
  const { e } = exam([MCQ(), { type: "SHORT_ANSWER", prompt: "Explain", marks: 6 }]);
  const data = await exams.getExamForAttempt(e.id);
  assert.ok(data);
  assert.ok(!JSON.stringify(data).includes("correctAnswer"), "the key is not in the payload at all");
  for (const q of data!.questions) assert.equal("correctAnswer" in q, false, "no key on any question");
});

test("C: another school's student, another class's student, and a signed-out visitor cannot open, start or answer the exam", async () => {
  const { e, qs } = exam([MCQ()]);
  for (const who of ["uF", "uN"]) {
    as(who);
    assert.equal(await exams.getExamForAttempt(e.id), null, who);
    assert.deepEqual(await exams.startExamAttempt(e.id), { ok: false, error: "Exam not available." }, who);
  }
  as("uA");
  const started = await exams.startExamAttempt(e.id);
  assert.equal(started.ok, true);
  const subId = started.data!.submissionId;
  as("uB"); // a classmate cannot write into A's attempt
  assert.deepEqual(await exams.saveExamAnswer(subId, qs[0].id, "4"), { ok: false, error: "Submission not found." });
  assert.deepEqual(await exams.submitExam(subId), { ok: false, error: "Submission not found." });
  session = null;
  assert.equal((await exams.startExamAttempt(e.id)).ok, false);
});

test("C: an unpublished exam is not available", async () => {
  as("uA");
  const { e } = exam([MCQ()], { status: "DRAFT" });
  assert.equal(await exams.getExamForAttempt(e.id), null);
  assert.equal((await exams.startExamAttempt(e.id)).ok, false);
});

test("C: an answer must belong to this exam's own question, and stops counting once the time is up", async () => {
  as("uA");
  const one = exam([MCQ()]);
  const two = exam([MCQ()]);
  const sub = (await exams.startExamAttempt(one.e.id)).data!.submissionId;
  assert.deepEqual(await exams.saveExamAnswer(sub, two.qs[0].id, "4"), { ok: false, error: "Question not found." });
  assert.equal((await exams.saveExamAnswer(sub, one.qs[0].id, "4")).ok, true);
  T.submissions.find((s) => s.id === sub)!.startedAt = new Date(Date.now() - (30 * 60 + 60) * 1000); // 31 minutes ago, 30 allowed (+30 s grace)
  assert.deepEqual(await exams.saveExamAnswer(sub, one.qs[0].id, "3"), { ok: false, error: "Time is up - this answer was not saved." });
  assert.equal(T.answers.find((a) => a.submissionId === sub)!.studentAnswer, "4", "the late answer did not overwrite");
});

test("C: submitting grades the multiple-choice questions on the server, and a second submit is refused", async () => {
  as("uA");
  const { e, qs } = exam([MCQ(2), MCQ(3), { type: "TRUE_FALSE", prompt: "Sky is blue", correctAnswer: "True", marks: 1 }], { maxMarks: 6 });
  const sub = (await exams.startExamAttempt(e.id)).data!.submissionId;
  await exams.saveExamAnswer(sub, qs[0].id, " 4 ");
  await exams.saveExamAnswer(sub, qs[1].id, "3"); // wrong
  assert.deepEqual(await exams.submitExam(sub), { ok: true });
  const row = T.submissions.find((s) => s.id === sub)!;
  assert.deepEqual([row.status, row.totalScore, row.maxScore], ["SUBMITTED", 2, 6], "2 of 6: the right answer counts (spaces ignored), the wrong one and the unanswered one do not");
  assert.deepEqual(await exams.submitExam(sub), { ok: false, error: "Already submitted." });
  assert.deepEqual(await exams.startExamAttempt(e.id), { ok: false, error: "You have already submitted this exam." });
  assert.equal(await exams.getExamForAttempt(e.id), null, "cannot re-enter");
  assert.equal((await exams.saveExamAnswer(sub, qs[1].id, "4")).ok, false, "cannot change answers after submitting");
  assert.equal(T.analyticsCalls > 0, true, "performance pages are refreshed");
});

test("C: submitting the SAME exam twice at once (two tabs, a double click) grades it once: one request wins, the other is told it was already submitted, and the teacher hears once", async () => {
  as("uA");
  const { e, qs } = exam([MCQ(2), MCQ(2)], { maxMarks: 4 });
  const sub = (await exams.startExamAttempt(e.id)).data!.submissionId;
  await exams.saveExamAnswer(sub, qs[0].id, "4");
  T.notifications.length = 0;
  T.analyticsCalls = 0;
  const results = await Promise.all([exams.submitExam(sub), exams.submitExam(sub), exams.submitExam(sub)]);
  assert.deepEqual(results.map((r) => r.ok).sort(), [false, false, true], JSON.stringify(results));
  assert.equal(results.filter((r) => !r.ok).every((r) => r.error === "Already submitted."), true);
  assert.equal(T.notifications.length, 1, "one notification");
  assert.equal(T.analyticsCalls, 1, "performance refreshed once");
  assert.deepEqual([T.submissions.find((s) => s.id === sub)!.status, T.submissions.find((s) => s.id === sub)!.totalScore], ["SUBMITTED", 2]);
});

test("C: the answer key and result appear only AFTER submitting, and only for the student's own submission", async () => {
  as("uA");
  const { e, qs } = exam([MCQ(2)], { maxMarks: 2 });
  const sub = (await exams.startExamAttempt(e.id)).data!.submissionId;
  await exams.saveExamAnswer(sub, qs[0].id, "3");
  assert.equal(await exams.getExamResultForStudent(e.id), null, "nothing while the attempt is open");
  await exams.submitExam(sub);
  const r = await exams.getExamResultForStudent(e.id);
  assert.deepEqual([r!.totalScore, r!.maxScore, r!.pendingReview], [0, 2, false]);
  assert.equal(r!.questions[0].correctAnswer, "4");
  as("uB");
  assert.equal(await exams.getExamResultForStudent(e.id), null, "a classmate has no result for it");
});

test("C: a written question the student SKIPPED leaves the result 'pending' (not a blank score shown as 0), and every question is listed", async () => {
  as("uA");
  const { e, qs } = exam([MCQ(2), { type: "SHORT_ANSWER", prompt: "Explain why", marks: 8 }], { maxMarks: 10 });
  const sub = (await exams.startExamAttempt(e.id)).data!.submissionId;
  await exams.saveExamAnswer(sub, qs[0].id, "4");
  await exams.submitExam(sub); // the written question is never answered, so it has no answer row at all
  const row = T.submissions.find((s) => s.id === sub)!;
  assert.equal(row.totalScore, null, "no final score until the teacher finalises it");
  const r = await exams.getExamResultForStudent(e.id);
  assert.equal(r!.pendingReview, true, "pending - the page must not print a score");
  assert.equal(r!.questions.length, 2, "the skipped written question is shown too");
  assert.deepEqual([r!.questions[1].studentAnswer, r!.questions[1].marksAwarded], [null, null]);
  assert.equal(r!.questions[0].marksAwarded, 2);
});

test("C: an unanswered multiple-choice question is shown with 0, not as pending", async () => {
  as("uA");
  const { e } = exam([MCQ(2)], { maxMarks: 2 });
  const sub = (await exams.startExamAttempt(e.id)).data!.submissionId;
  await exams.submitExam(sub);
  const r = await exams.getExamResultForStudent(e.id);
  assert.deepEqual([r!.totalScore, r!.pendingReview, r!.questions[0].marksAwarded, r!.questions[0].studentAnswer], [0, false, 0, null]);
});

test("C: the teacher is told an exam was submitted - and that it needs marking when it has written answers", async () => {
  as("uA");
  const { e, qs } = exam([MCQ(2), { type: "LONG_ANSWER", prompt: "Essay", marks: 8 }]);
  const sub = (await exams.startExamAttempt(e.id)).data!.submissionId;
  await exams.saveExamAnswer(sub, qs[1].id, "My essay");
  T.notifications.length = 0;
  await exams.submitExam(sub);
  assert.equal(T.notifications.length, 1);
  assert.match(T.notifications[0].title, /needs marking/);
  assert.equal(T.notifications[0].userId, "tu1");
});

// ---- F. practice ---------------------------------------------------------------------------------------------------------------------------------------------------------
function practiceSession(owner = "uA") {
  const questions = [0, 1, 2].map((i) => ({ id: id("pq"), topicId: "topic1", bloomLevel: 2, marks: 1, prompt: `Q${i}`, options: ["x", "y", "z", "w"], correctAnswer: "y", explanation: `because ${i}`, improvementTip: "practice" }));
  T.bank.push(...questions);
  const paper = { id: id("paper"), title: "Practice: Fractions", createdByUserId: owner, createdAt: new Date("2026-10-17T05:00:00Z") };
  T.papers.push(paper);
  questions.forEach((q, i) => T.paperQuestions.push({ id: id("pqrow"), paperId: paper.id, questionId: q.id, order: i }));
  return { paper, questions };
}

test("F: the practice questions are served WITHOUT the answer key, shuffled the same way every time, only to their owner", async () => {
  as("uA");
  const { paper } = practiceSession();
  const open = await practice.getPracticePaper(paper.id);
  assert.equal(open && open.status, "open");
  const first = JSON.stringify(open);
  assert.ok(!first.includes("correctAnswer") && !first.includes("because"), "no key and no explanation before submitting");
  assert.equal(JSON.stringify(await practice.getPracticePaper(paper.id)), first, "the same order on reload");
  as("uB");
  assert.equal(await practice.getPracticePaper(paper.id), null, "someone else's session is not found");
  assert.deepEqual(await practice.submitPractice(paper.id, {}), { ok: false, error: "Practice session not found." });
  assert.equal(await practice.getPracticeResult(paper.id), null);
});

test("F: submitting scores it on the server by the stored answer, saves the attempt once, and the review then shows answers and explanations", async () => {
  as("uA");
  T.analyticsCalls = 0;
  const { paper, questions } = practiceSession();
  const answers = { [questions[0].id]: "y", [questions[1].id]: "x", "not-a-question-of-this-paper": "y" };
  assert.deepEqual(await practice.submitPractice(paper.id, answers), { ok: true, data: { paperId: paper.id } });
  const attempt = T.attempts.find((a) => a.paperId === paper.id)!;
  assert.deepEqual([attempt.scoreObtained, attempt.totalMarks, Math.round(attempt.accuracy)], [1, 3, 33], "1 right, 1 wrong, 1 unanswered");
  assert.deepEqual(Object.keys(attempt.answers).sort(), [questions[0].id, questions[1].id].sort(), "only this paper's own questions are stored");
  assert.equal(attempt.scores.length, 3);
  assert.ok(T.analyticsCalls > 0, "progress, weak areas and strengths are refreshed");
  const res = await practice.getPracticeResult(paper.id);
  assert.deepEqual([res!.score, res!.total], [1, 3]);
  assert.deepEqual(res!.questions.map((q) => [q.yourAnswer, q.isCorrect, q.correctAnswer]), [["y", true, "y"], ["x", false, "y"], [null, false, "y"]]);
  assert.equal(res!.questions[1].explanation, "because 1");
  // and the open paper is now closed
  assert.deepEqual(await practice.getPracticePaper(paper.id), { status: "submitted" });
});

test("F: a second submit is refused and the score is not recomputed", async () => {
  as("uA");
  const { paper, questions } = practiceSession();
  await practice.submitPractice(paper.id, { [questions[0].id]: "y" });
  const r = await practice.submitPractice(paper.id, { [questions[0].id]: "x", [questions[1].id]: "y", [questions[2].id]: "y" });
  assert.deepEqual(r, { ok: false, error: "You have already submitted this practice session." });
  assert.equal(T.attempts.filter((a) => a.paperId === paper.id).length, 1);
  assert.equal(T.attempts.find((a) => a.paperId === paper.id)!.scoreObtained, 1);
});

test("F: if refreshing the performance pages fails, the attempt is still saved and the student still gets their result", async () => {
  as("uA");
  const { paper, questions } = practiceSession();
  T.analyticsFail = true;
  try {
    assert.equal((await practice.submitPractice(paper.id, { [questions[0].id]: "y" })).ok, true);
  } finally {
    T.analyticsFail = false;
  }
  assert.equal(T.attempts.filter((a) => a.paperId === paper.id).length, 1);
});

test("F: the check 'no attempt yet' and the save run in ONE serializable transaction", async () => {
  as("uA");
  const { paper, questions } = practiceSession();
  T.txOptions.length = 0;
  assert.equal((await practice.submitPractice(paper.id, { [questions[0].id]: "y" })).ok, true);
  assert.equal(T.txOptions.length, 1);
  assert.deepEqual(T.txOptions[0], { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  assert.equal(Prisma.TransactionIsolationLevel.Serializable, "Serializable");
});

test("F: two submits that overlap - the second finds the first one's attempt inside the transaction and saves nothing more", async () => {
  as("uA");
  const { paper, questions } = practiceSession();
  // The caller's earlier read saw no attempt; by the time its transaction runs, the other submit has saved one.
  T.beforeTx = () => {
    T.beforeTx = null;
    T.attempts.push({ id: id("att"), paperId: paper.id, studentId: "stuA", scoreObtained: 3, scores: [] });
  };
  const r = await practice.submitPractice(paper.id, { [questions[0].id]: "x" });
  assert.deepEqual(r, { ok: false, error: "You have already submitted this practice session." });
  assert.equal(T.attempts.filter((a) => a.paperId === paper.id).length, 1, "still exactly one attempt");
  assert.equal(T.attempts[T.attempts.length - 1].scoreObtained, 3, "the first one's score stands");
});

test("F: the database aborting an overlapping transaction (P2034): a repeat is reported as already submitted; a spurious abort asks to press Submit again and loses nothing", async () => {
  as("uA");
  const serializationFailure = () => new Prisma.PrismaClientKnownRequestError("could not serialize access", { code: "P2034", clientVersion: "test" });
  // (a) the other submit won and saved
  const a = practiceSession();
  T.beforeTx = () => {
    T.beforeTx = null;
    T.attempts.push({ id: id("att"), paperId: a.paper.id, studentId: "stuA", scoreObtained: 1, scores: [] });
  };
  T.txError = serializationFailure();
  assert.deepEqual(await practice.submitPractice(a.paper.id, {}), { ok: false, error: "You have already submitted this practice session." });
  // (b) nothing was saved: the student is told to try again - and trying again works
  const b = practiceSession();
  T.txError = serializationFailure();
  const spurious = await practice.submitPractice(b.paper.id, { [b.questions[0].id]: "y" });
  assert.equal(spurious.ok, false);
  assert.match(spurious.error ?? "", /press Submit again/);
  assert.equal(T.attempts.filter((x) => x.paperId === b.paper.id).length, 0);
  T.txError = null;
  assert.equal((await practice.submitPractice(b.paper.id, { [b.questions[0].id]: "y" })).ok, true);
  assert.equal(T.attempts.filter((x) => x.paperId === b.paper.id).length, 1);
});

test("F: any OTHER database failure while saving is not disguised as 'already submitted'", async () => {
  as("uA");
  const { paper } = practiceSession();
  T.txError = new Error("connection lost");
  try {
    await assert.rejects(() => practice.submitPractice(paper.id, {}), /connection lost/);
  } finally {
    T.txError = null;
  }
  assert.equal(T.attempts.filter((x) => x.paperId === paper.id).length, 0);
});
