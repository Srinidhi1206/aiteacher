"use server";

// Real self-practice, built on the existing Question / Paper / PaperQuestion /
// Attempt / Score models (nothing new in the schema).
//
//   - Question bank: a shared, per-TOPIC bank of multiple-choice questions.
//     It is curriculum content, not school data, so it is shared across
//     schools. It fills itself on demand: when a student starts practice and
//     the topic has too few unseen questions, Gemini writes more (validated
//     before anything is stored) - nobody has to hand-author a bank.
//   - A practice session is a Paper (isCustom, createdByUserId = the student's
//     user). The paper is private: only its creator can open, submit or read
//     its result.
//   - Grading happens here, on the server, against the stored correct answer.
//     The browser never sees an answer key until after it has submitted, and
//     never sends a score.
//   - Each graded question becomes a Score row (Score.topic holds the topic id),
//     and mastery / weak areas / strengths are recalculated from exams AND
//     practice together (lib/analytics/progress.ts).
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole, ForbiddenError, UnauthorizedError } from "@/lib/auth/current-session";
import { getAIProvider, AIError } from "@/lib/ai";
import { recalculateProgressForStudent } from "@/lib/analytics/progress";
import { recalculateWeakAreas } from "@/lib/analytics/weakness";
import { recalculateStrengths } from "@/lib/analytics/strengths";
import type { ActionResult } from "./materials";

const QUESTIONS_PER_SESSION = 5;
const RESUME_WINDOW_MS = 6 * 60 * 60 * 1000;

async function requireStudent() {
  const session = await requireRole("student");
  const student = await prisma.student.findUnique({ where: { userId: session.id }, select: { id: true, schoolClassId: true } });
  if (!student) throw new ForbiddenError("Student profile not found.");
  return { session, student };
}

function failure(e: unknown): { ok: false; error: string } {
  if (e instanceof UnauthorizedError || e instanceof ForbiddenError) return { ok: false, error: e.message };
  throw e;
}

// Models tend to put the correct answer first, and a student who notices could
// ace practice by always picking option 1. So options are always presented in a
// shuffled order. The shuffle is seeded by (paper, question) so it is stable
// across reloads and identical on the results page, and it is applied on the
// server - answers are matched by text, never by position.
function seededShuffle<T>(items: T[], seed: string): T[] {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let state = h >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function optionsOf(question: { options: unknown }, paperId: string, questionId: string): string[] {
  const raw = Array.isArray(question.options) ? (question.options as string[]) : [];
  return seededShuffle(raw, `${paperId}:${questionId}`);
}

// ---------------------------------------------------------------------------
// Question generation (only runs when the bank is short)
// ---------------------------------------------------------------------------

const generatedQuestionSchema = z.object({
  prompt: z.string().trim().min(8).max(600),
  options: z.array(z.string().trim().min(1).max(200)).length(4),
  correctAnswer: z.string().trim().min(1),
  explanation: z.string().trim().min(5).max(800),
  improvementTip: z.string().trim().min(5).max(400),
  bloomLevel: z.number().int().min(1).max(4).catch(2),
});

function parseGenerated(text: string) {
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start < 0 || end <= start) return [];
  let raw: unknown;
  try {
    raw = JSON.parse(text.slice(start, end + 1));
  } catch {
    return [];
  }
  if (!Array.isArray(raw)) return [];
  const valid: z.infer<typeof generatedQuestionSchema>[] = [];
  for (const item of raw) {
    const parsed = generatedQuestionSchema.safeParse(item);
    if (!parsed.success) continue;
    const q = parsed.data;
    // The answer key must be exactly one of the options, and options must be distinct.
    if (!q.options.includes(q.correctAnswer)) continue;
    if (new Set(q.options.map((o) => o.toLowerCase())).size !== 4) continue;
    valid.push(q);
  }
  return valid;
}

async function generateQuestionBank(topic: { id: string; name: string; chapter: { name: string; subject: { name: string } } }, classLabel: string, boardName: string, count: number) {
  const provider = getAIProvider();
  if (!provider) throw new AIError("AI_NOT_CONFIGURED");

  // The model is an external service: a 503/429 or a malformed reply is
  // normal now and then, so retry a couple of times with a short backoff
  // before giving up (the student sees a clear error only if all attempts fail).
  const request = {
    systemPrompt:
      "You write multiple-choice practice questions for school students. " +
      "Reply with ONLY a JSON array, no markdown and no commentary. Each element must be an object with exactly these keys: " +
      '"prompt" (the question), "options" (an array of exactly 4 different short answer strings), ' +
      '"correctAnswer" (must be copied exactly from one of the options), "explanation" (why that answer is right, 1-3 sentences), ' +
      '"improvementTip" (one sentence on how to get better at this idea), "bloomLevel" (integer: 1 remember, 2 understand, 3 apply, 4 analyze). ' +
      "Questions must be factually correct, unambiguous, have exactly one correct option, and suit the stated class level.",
    messages: [],
    userMessage:
      `Board: ${boardName}. Class: ${classLabel}. Subject: ${topic.chapter.subject.name}. Chapter: ${topic.chapter.name}. Topic: ${topic.name}.\n` +
      `Write ${count} different multiple-choice questions on exactly this topic, mixing easier and harder ones.`,
    temperature: 0.5,
    maxOutputTokens: 4096,
  };

  let questions: ReturnType<typeof parseGenerated> = [];
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 3 && questions.length < 3; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 1500 * attempt));
    try {
      questions = parseGenerated((await provider.generateResponse(request)).content);
    } catch (err) {
      lastError = err;
      if (err instanceof AIError && (err.code === "AI_RATE_LIMITED" || err.code === "AI_NOT_CONFIGURED")) break; // quota: retrying only spends more of it
    }
  }
  if (questions.length < 3) {
    throw lastError instanceof AIError ? lastError : new AIError("AI_PROVIDER_ERROR", "The AI did not return usable questions.");
  }

  const existing = new Set((await prisma.question.findMany({ where: { topicId: topic.id }, select: { prompt: true } })).map((q) => q.prompt.trim().toLowerCase()));
  const fresh = questions.filter((q) => !existing.has(q.prompt.trim().toLowerCase()));
  if (fresh.length > 0) {
    await prisma.question.createMany({
      data: fresh.map((q) => ({
        topicId: topic.id,
        type: "MCQ" as const,
        bloomLevel: q.bloomLevel,
        marks: 1,
        prompt: q.prompt,
        options: seededShuffle(q.options, `${topic.id}:${q.prompt}`),
        correctAnswer: q.correctAnswer,
        explanation: q.explanation,
        improvementTip: q.improvementTip,
      })),
    });
  }
  return fresh.length;
}

// ---------------------------------------------------------------------------
// Start / open / submit / result
// ---------------------------------------------------------------------------

export async function startPractice(topicId: string): Promise<ActionResult<{ paperId: string }>> {
  try {
    const { session, student } = await requireStudent();
    if (!student.schoolClassId) return { ok: false, error: "You have not been placed in a class yet." };

    const topic = await prisma.topic.findUnique({
      where: { id: topicId },
      include: { chapter: { include: { subject: { select: { id: true, name: true } } } } },
    });
    if (!topic) return { ok: false, error: "Topic not found." };
    // The topic's subject must be one of the student's own class's subjects.
    const link = await prisma.schoolClassSubject.findUnique({
      where: { schoolClassId_subjectId: { schoolClassId: student.schoolClassId, subjectId: topic.chapter.subject.id } },
      select: { isEnabled: true, schoolClass: { select: { label: true, board: { select: { shortName: true } } } } },
    });
    if (!link?.isEnabled) return { ok: false, error: "Topic not found." };

    // Resume an unstarted session for this topic instead of piling up papers on a double-click.
    const open = await prisma.paper.findFirst({
      where: {
        createdByUserId: session.id,
        isCustom: true,
        attempts: { none: {} },
        createdAt: { gt: new Date(Date.now() - RESUME_WINDOW_MS) },
        questions: { some: { question: { topicId } } },
      },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    if (open) return { ok: true, data: { paperId: open.id } };

    // Questions this student saw in their recent sessions on this topic are set aside first.
    const recentPapers = await prisma.paper.findMany({
      where: { createdByUserId: session.id, questions: { some: { question: { topicId } } } },
      orderBy: { createdAt: "desc" },
      take: 3,
      select: { questions: { select: { questionId: true } } },
    });
    const seen = new Set(recentPapers.flatMap((p) => p.questions.map((q) => q.questionId)));

    const bank = () => prisma.question.findMany({ where: { topicId, type: "MCQ" } });
    let all = await bank();
    let pool = all.filter((q) => !seen.has(q.id));
    if (pool.length < QUESTIONS_PER_SESSION) {
      await generateQuestionBank(topic, link.schoolClass.label, link.schoolClass.board.shortName, 8);
      all = await bank();
      pool = all.filter((q) => !seen.has(q.id));
    }
    // If the bank is still short of unseen questions, repeats are better than nothing.
    if (pool.length < QUESTIONS_PER_SESSION) pool = all;
    if (pool.length < 3) return { ok: false, error: "Not enough practice questions for this topic yet. Please try again." };

    const picked = [...pool].sort(() => Math.random() - 0.5).slice(0, QUESTIONS_PER_SESSION);
    const paper = await prisma.paper.create({
      data: {
        subjectId: topic.chapter.subject.id,
        title: `Practice: ${topic.name}`,
        type: "CHAPTER_TEST",
        totalMarks: picked.reduce((sum, q) => sum + q.marks, 0),
        durationMinutes: picked.length * 2,
        difficulty: "Mixed",
        isCustom: true,
        createdByUserId: session.id,
        questions: { create: picked.map((q, i) => ({ questionId: q.id, order: i })) },
      },
    });
    return { ok: true, data: { paperId: paper.id } };
  } catch (e) {
    if (e instanceof AIError) return { ok: false, error: e.code === "AI_NOT_CONFIGURED" ? "Practice questions need the AI service, which is not configured." : "Could not prepare practice questions right now. Please try again in a moment." };
    return failure(e);
  }
}

export interface PracticeQuestionView {
  id: string;
  prompt: string;
  options: string[];
  marks: number;
}

/** The paper's questions WITHOUT correct answers, only for its owner and only until it is submitted. */
export async function getPracticePaper(paperId: string): Promise<{ status: "open"; title: string; questions: PracticeQuestionView[] } | { status: "submitted" } | null> {
  const { session } = await requireStudent();
  const paper = await prisma.paper.findUnique({
    where: { id: paperId },
    include: { questions: { orderBy: { order: "asc" }, include: { question: true } }, attempts: { where: { student: { userId: session.id } }, select: { id: true } } },
  });
  if (!paper || paper.createdByUserId !== session.id) return null;
  if (paper.attempts.length > 0) return { status: "submitted" };
  return {
    status: "open",
    title: paper.title,
    questions: paper.questions.map((pq) => ({
      id: pq.question.id,
      prompt: pq.question.prompt,
      options: optionsOf(pq.question, paper.id, pq.question.id),
      marks: pq.question.marks,
    })),
  };
}

export async function submitPractice(paperId: string, answers: Record<string, string>): Promise<ActionResult<{ paperId: string }>> {
  try {
    const { session, student } = await requireStudent();
    const paper = await prisma.paper.findUnique({
      where: { id: paperId },
      include: { questions: { include: { question: true } }, attempts: { where: { studentId: student.id }, select: { id: true } } },
    });
    if (!paper || paper.createdByUserId !== session.id) return { ok: false, error: "Practice session not found." };
    if (paper.attempts.length > 0) return { ok: false, error: "You have already submitted this practice session." };

    let score = 0;
    const total = paper.questions.reduce((sum, pq) => sum + pq.question.marks, 0);
    const scoreRows = paper.questions.map((pq) => {
      const given = typeof answers[pq.question.id] === "string" ? answers[pq.question.id].trim() : "";
      const correct = given !== "" && given === pq.question.correctAnswer.trim();
      const marksScored = correct ? pq.question.marks : 0;
      score += marksScored;
      return { topic: pq.question.topicId, bloomLevel: pq.question.bloomLevel, marksScored, marksTotal: pq.question.marks, isCorrect: correct };
    });

    const accuracy = total > 0 ? (score / total) * 100 : 0;
    // Only answers to this paper's own questions are stored.
    const stored: Record<string, string> = {};
    for (const pq of paper.questions) if (typeof answers[pq.question.id] === "string") stored[pq.question.id] = answers[pq.question.id].slice(0, 300);

    await prisma.attempt.create({
      data: {
        studentId: student.id,
        paperId: paper.id,
        answers: stored,
        flagged: [],
        startedAt: paper.createdAt,
        timeTakenSeconds: Math.max(0, Math.round((Date.now() - paper.createdAt.getTime()) / 1000)),
        scoreObtained: score,
        totalMarks: total,
        accuracy,
        conceptUnderstanding: accuracy,
        scores: { create: scoreRows },
      },
    });

    // Best-effort, like exam grading: a failure here must not lose the attempt.
    await (async () => {
      await recalculateProgressForStudent(student.id);
      await recalculateWeakAreas(student.id);
      await recalculateStrengths(student.id);
    })().catch((err) => console.error("Practice analytics recalculation failed:", err));

    return { ok: true, data: { paperId: paper.id } };
  } catch (e) {
    return failure(e);
  }
}

export interface PracticeResult {
  title: string;
  score: number;
  total: number;
  accuracy: number;
  timeTakenSeconds: number;
  submittedAt: Date;
  questions: {
    prompt: string;
    options: string[];
    yourAnswer: string | null;
    correctAnswer: string;
    isCorrect: boolean;
    explanation: string;
    improvementTip: string;
  }[];
}

/** The answer key and explanations - only ever returned for a paper the student has already submitted. */
export async function getPracticeResult(paperId: string): Promise<PracticeResult | null> {
  const { session, student } = await requireStudent();
  const paper = await prisma.paper.findUnique({
    where: { id: paperId },
    include: {
      questions: { orderBy: { order: "asc" }, include: { question: true } },
      attempts: { where: { studentId: student.id }, orderBy: { createdAt: "desc" }, take: 1 },
    },
  });
  const attempt = paper?.attempts[0];
  if (!paper || paper.createdByUserId !== session.id || !attempt) return null;
  const answers = (attempt.answers ?? {}) as Record<string, string>;
  return {
    title: paper.title,
    score: attempt.scoreObtained,
    total: attempt.totalMarks,
    accuracy: Math.round(attempt.accuracy),
    timeTakenSeconds: attempt.timeTakenSeconds,
    submittedAt: attempt.createdAt,
    questions: paper.questions.map((pq) => {
      const given = answers[pq.question.id] ?? null;
      return {
        prompt: pq.question.prompt,
        options: optionsOf(pq.question, paper.id, pq.question.id),
        yourAnswer: given,
        correctAnswer: pq.question.correctAnswer,
        isCorrect: given !== null && given.trim() === pq.question.correctAnswer.trim(),
        explanation: pq.question.explanation,
        improvementTip: pq.question.improvementTip,
      };
    }),
  };
}

export async function listMyPracticeHistory() {
  const { student } = await requireStudent();
  const attempts = await prisma.attempt.findMany({
    where: { studentId: student.id },
    orderBy: { createdAt: "desc" },
    take: 10,
    include: { paper: { select: { id: true, title: true } } },
  });
  return attempts.map((a) => ({
    paperId: a.paper.id,
    title: a.paper.title,
    score: a.scoreObtained,
    total: a.totalMarks,
    at: a.createdAt,
  }));
}
