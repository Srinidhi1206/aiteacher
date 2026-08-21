"use server";

// Exam creation, question management, student attempt flow, evaluation,
// and grading (Stage C4 + Stage D). One data-access layer for the whole
// exam pipeline - the teacher's "upload/create exam paper" (C4) and the
// full question-builder/evaluation flow (D1-D5) share these functions
// rather than duplicating an exam concept.
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentSession, requireRole, ForbiddenError, UnauthorizedError } from "@/lib/auth/current-session";
import { storage, validateUploadFile, safeFilename, StorageNotConfiguredError } from "@/lib/storage";
import { QuestionType } from "@prisma/client";
import type { ActionResult } from "./materials";
import { recalculateProgressForStudent } from "@/lib/analytics/progress";
import { recalculateWeakAreas } from "@/lib/analytics/weakness";
import { recalculateStrengths } from "@/lib/analytics/strengths";

async function refreshStudentAnalytics(studentId: string) {
  // Runs after any event that changes a student's graded results, so
  // progress/weak-area/strength pages never go stale. Best-effort: a
  // failure here shouldn't fail the grading action itself.
  await Promise.all([
    recalculateProgressForStudent(studentId),
    recalculateWeakAreas(studentId),
    recalculateStrengths(studentId),
  ]).catch((err) => console.error("Analytics recalculation failed:", err));
}

// ---------------------------------------------------------------------------
// Teacher: create / configure exam
// ---------------------------------------------------------------------------

const examInputSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(200),
  schoolClassId: z.string().min(1, "Class is required"),
  subjectId: z.string().min(1, "Subject is required"),
  chapterScope: z.string().trim().max(500).optional(),
  durationMinutes: z.number().int().min(1).max(600),
  maxMarks: z.number().int().min(1).max(1000),
  instructions: z.string().trim().max(4000).optional(),
});

async function requireOwnedAssignment(schoolClassId: string, subjectId: string) {
  const session = await requireRole("teacher");
  const teacher = await prisma.teacher.findUnique({ where: { userId: session.id } });
  if (!teacher) throw new ForbiddenError("Teacher profile not found.");
  const assigned = await prisma.teacherAssignment.findFirst({ where: { teacherId: teacher.id, schoolClassId, subjectId } });
  if (!assigned) throw new ForbiddenError("You are not assigned to this class/subject.");
  return { session, teacher };
}

async function requireOwnedExam(examId: string) {
  const session = await requireRole("teacher");
  const exam = await prisma.exam.findUnique({ where: { id: examId }, include: { teacher: true } });
  if (!exam) throw new ForbiddenError("Exam not found.");
  if (exam.teacher.userId !== session.id) throw new ForbiddenError("You can only manage your own exams.");
  return { session, exam };
}

export async function createExam(input: unknown, file?: File | null): Promise<ActionResult<{ id: string }>> {
  try {
    const parsed = examInputSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
    const data = parsed.data;
    const { teacher } = await requireOwnedAssignment(data.schoolClassId, data.subjectId);

    let fileUrl: string | undefined;
    let storageKey: string | undefined;
    if (file && file.size > 0) {
      const fileCheck = validateUploadFile({ type: file.type, size: file.size });
      if (!fileCheck.ok) return { ok: false, error: fileCheck.error };
      if (!storage.isConfigured) {
        return { ok: false, error: "File storage is not configured. Set BLOB_READ_WRITE_TOKEN to enable uploads (see docs/DATABASE.md)." };
      }
      try {
        const uploaded = await storage.upload({
          file,
          pathname: `exams/${data.schoolClassId}/${data.subjectId}/${Date.now()}-${safeFilename(file.name)}`,
          contentType: file.type,
        });
        fileUrl = uploaded.url;
        storageKey = uploaded.storageKey;
      } catch (e) {
        if (e instanceof StorageNotConfiguredError) return { ok: false, error: e.message };
        throw e;
      }
    }

    const exam = await prisma.exam.create({
      data: {
        title: data.title,
        teacherId: teacher.id,
        schoolClassId: data.schoolClassId,
        subjectId: data.subjectId,
        chapterScope: data.chapterScope,
        durationMinutes: data.durationMinutes,
        maxMarks: data.maxMarks,
        instructions: data.instructions,
        fileUrl,
        storageKey,
        status: "DRAFT",
      },
    });
    return { ok: true, data: { id: exam.id } };
  } catch (e) {
    if (e instanceof UnauthorizedError || e instanceof ForbiddenError) return { ok: false, error: e.message };
    throw e;
  }
}

// ---------------------------------------------------------------------------
// Teacher: question management (D2) - draft-only edits, so a published
// exam's questions can never shift under students who already have
// submissions in flight.
// ---------------------------------------------------------------------------

const questionInputSchema = z.object({
  type: z.nativeEnum(QuestionType),
  prompt: z.string().trim().min(1, "Question text is required"),
  options: z.array(z.string()).optional(),
  correctAnswer: z.string().trim().optional(), // omitted for LONG_ANSWER/SHORT_ANSWER (teacher-graded)
  marks: z.number().int().min(1).max(100),
  // Optional tag used by lib/analytics/* to attribute weakness/strength at
  // topic granularity - see the schema comment on ExamQuestion.topicId.
  topicId: z.string().optional(),
});

async function requireDraftOwnedExam(examId: string) {
  const { session, exam } = await requireOwnedExam(examId);
  if (exam.status !== "DRAFT") throw new ForbiddenError("Questions can only be edited while the exam is still a draft.");
  return { session, exam };
}

export async function addExamQuestion(examId: string, input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    await requireDraftOwnedExam(examId);
    const parsed = questionInputSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
    const data = parsed.data;
    const count = await prisma.examQuestion.count({ where: { examId } });
    const question = await prisma.examQuestion.create({
      data: {
        examId,
        type: data.type,
        prompt: data.prompt,
        options: data.options,
        correctAnswer: data.correctAnswer || null,
        marks: data.marks,
        topicId: data.topicId || null,
        order: count,
      },
    });
    return { ok: true, data: { id: question.id } };
  } catch (e) {
    if (e instanceof UnauthorizedError || e instanceof ForbiddenError) return { ok: false, error: e.message };
    throw e;
  }
}

export async function updateExamQuestion(questionId: string, input: unknown): Promise<ActionResult> {
  try {
    const question = await prisma.examQuestion.findUnique({ where: { id: questionId } });
    if (!question) return { ok: false, error: "Question not found." };
    await requireDraftOwnedExam(question.examId);
    const parsed = questionInputSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
    const data = parsed.data;
    await prisma.examQuestion.update({
      where: { id: questionId },
      data: {
        type: data.type,
        prompt: data.prompt,
        options: data.options,
        correctAnswer: data.correctAnswer || null,
        marks: data.marks,
        topicId: data.topicId || null,
      },
    });
    return { ok: true };
  } catch (e) {
    if (e instanceof UnauthorizedError || e instanceof ForbiddenError) return { ok: false, error: e.message };
    throw e;
  }
}

export async function deleteExamQuestion(questionId: string): Promise<ActionResult> {
  try {
    const question = await prisma.examQuestion.findUnique({ where: { id: questionId } });
    if (!question) return { ok: false, error: "Question not found." };
    await requireDraftOwnedExam(question.examId);
    await prisma.examQuestion.delete({ where: { id: questionId } });
    return { ok: true };
  } catch (e) {
    if (e instanceof UnauthorizedError || e instanceof ForbiddenError) return { ok: false, error: e.message };
    throw e;
  }
}

export async function reorderExamQuestions(examId: string, orderedQuestionIds: string[]): Promise<ActionResult> {
  try {
    await requireDraftOwnedExam(examId);
    await prisma.$transaction(
      orderedQuestionIds.map((id, index) => prisma.examQuestion.update({ where: { id }, data: { order: index } }))
    );
    return { ok: true };
  } catch (e) {
    if (e instanceof UnauthorizedError || e instanceof ForbiddenError) return { ok: false, error: e.message };
    throw e;
  }
}

export async function publishExam(examId: string): Promise<ActionResult> {
  try {
    const { exam } = await requireOwnedExam(examId);
    const questionCount = await prisma.examQuestion.count({ where: { examId } });
    if (questionCount === 0) return { ok: false, error: "Add at least one question before publishing." };
    if (exam.status === "PUBLISHED") return { ok: false, error: "Exam is already published." };
    await prisma.exam.update({ where: { id: examId }, data: { status: "PUBLISHED" } });
    if (exam.scheduleId) {
      await prisma.examSchedule.update({ where: { id: exam.scheduleId }, data: { isPublished: true } }).catch(() => {});
    }
    return { ok: true };
  } catch (e) {
    if (e instanceof UnauthorizedError || e instanceof ForbiddenError) return { ok: false, error: e.message };
    throw e;
  }
}

export async function unpublishExam(examId: string): Promise<ActionResult> {
  try {
    await requireOwnedExam(examId);
    await prisma.exam.update({ where: { id: examId }, data: { status: "UNPUBLISHED" } });
    return { ok: true };
  } catch (e) {
    if (e instanceof UnauthorizedError || e instanceof ForbiddenError) return { ok: false, error: e.message };
    throw e;
  }
}

/** The logged-in teacher's own class/subject assignments - populates the "which class/subject" selector on exam/worksheet/material creation forms so a teacher can only pick combinations they're actually assigned to. */
export async function listMyTeacherAssignments() {
  const session = await requireRole("teacher");
  const teacher = await prisma.teacher.findUnique({ where: { userId: session.id } });
  if (!teacher) return [];
  return prisma.teacherAssignment.findMany({
    where: { teacherId: teacher.id },
    include: { schoolClass: { include: { board: true } }, subject: true },
    orderBy: [{ schoolClass: { grade: "asc" } }, { subject: { name: "asc" } }],
  });
}

export async function listExamsForTeacher() {
  const session = await requireRole("teacher");
  const teacher = await prisma.teacher.findUnique({ where: { userId: session.id } });
  if (!teacher) return [];
  return prisma.exam.findMany({
    where: { teacherId: teacher.id },
    include: { schoolClass: true, subject: true, questions: true, submissions: true },
    orderBy: { createdAt: "desc" },
  });
}

export async function getExamForTeacher(examId: string) {
  const { exam } = await requireOwnedExam(examId);
  return prisma.exam.findUnique({
    where: { id: exam.id },
    include: {
      schoolClass: true,
      subject: true,
      questions: { orderBy: { order: "asc" } },
      submissions: { include: { student: { include: { user: true } }, grade: true } },
    },
  });
}

// ---------------------------------------------------------------------------
// Student: browse + attempt (D3)
// ---------------------------------------------------------------------------

async function requireStudentProfile() {
  const session = await requireRole("student");
  const student = await prisma.student.findUnique({ where: { userId: session.id } });
  if (!student) throw new ForbiddenError("Student profile not found.");
  return { session, student };
}

export async function listExamsForStudent() {
  const { student } = await requireStudentProfile();
  if (!student.schoolClassId) return [];
  return prisma.exam.findMany({
    where: { schoolClassId: student.schoolClassId, status: "PUBLISHED" },
    include: {
      subject: true,
      submissions: { where: { studentId: student.id } },
    },
    orderBy: { createdAt: "desc" },
  });
}

/** Questions WITHOUT correctAnswer - never expose answers before submission. */
export async function getExamForAttempt(examId: string) {
  const { student } = await requireStudentProfile();
  const exam = await prisma.exam.findUnique({
    where: { id: examId },
    include: { subject: true, questions: { orderBy: { order: "asc" } } },
  });
  if (!exam || exam.status !== "PUBLISHED" || exam.schoolClassId !== student.schoolClassId) return null;

  const existing = await prisma.examSubmission.findUnique({ where: { examId_studentId: { examId, studentId: student.id } } });
  if (existing?.status === "SUBMITTED" || existing?.status === "GRADED") return null; // already submitted, can't re-enter

  return {
    id: exam.id,
    title: exam.title,
    subject: exam.subject.name,
    durationMinutes: exam.durationMinutes,
    maxMarks: exam.maxMarks,
    instructions: exam.instructions,
    questions: exam.questions.map((q) => ({
      id: q.id,
      type: q.type,
      prompt: q.prompt,
      options: q.options,
      marks: q.marks,
      order: q.order,
    })),
  };
}

export async function startExamAttempt(examId: string): Promise<ActionResult<{ submissionId: string }>> {
  try {
    const { student } = await requireStudentProfile();
    const exam = await prisma.exam.findUnique({ where: { id: examId } });
    if (!exam || exam.status !== "PUBLISHED" || exam.schoolClassId !== student.schoolClassId) {
      return { ok: false, error: "Exam not available." };
    }
    const submission = await prisma.examSubmission.upsert({
      where: { examId_studentId: { examId, studentId: student.id } },
      update: {},
      create: { examId, studentId: student.id, status: "IN_PROGRESS", startedAt: new Date() },
    });
    if (submission.status === "SUBMITTED" || submission.status === "GRADED") {
      return { ok: false, error: "You have already submitted this exam." };
    }
    return { ok: true, data: { submissionId: submission.id } };
  } catch (e) {
    if (e instanceof UnauthorizedError || e instanceof ForbiddenError) return { ok: false, error: e.message };
    throw e;
  }
}

export async function saveExamAnswer(submissionId: string, questionId: string, answer: string): Promise<ActionResult> {
  try {
    const { student } = await requireStudentProfile();
    const submission = await prisma.examSubmission.findUnique({ where: { id: submissionId } });
    if (!submission || submission.studentId !== student.id) return { ok: false, error: "Submission not found." };
    if (submission.status !== "IN_PROGRESS" && submission.status !== "NOT_STARTED") {
      return { ok: false, error: "This exam has already been submitted." };
    }
    await prisma.examAnswer.upsert({
      where: { submissionId_questionId: { submissionId, questionId } },
      update: { studentAnswer: answer },
      create: { submissionId, questionId, studentAnswer: answer },
    });
    if (submission.status === "NOT_STARTED") {
      await prisma.examSubmission.update({ where: { id: submissionId }, data: { status: "IN_PROGRESS" } });
    }
    return { ok: true };
  } catch (e) {
    if (e instanceof UnauthorizedError || e instanceof ForbiddenError) return { ok: false, error: e.message };
    throw e;
  }
}

// ---------------------------------------------------------------------------
// Evaluation (D4) - MCQ/TRUE_FALSE auto-graded server-side against the
// stored correct answer; SHORT_ANSWER/LONG_ANSWER left pending for a
// teacher. Never trust a client-submitted score.
// ---------------------------------------------------------------------------

function normalizeAnswer(v: string | null | undefined): string {
  return (v ?? "").trim().toLowerCase();
}

export async function submitExam(submissionId: string): Promise<ActionResult> {
  try {
    const { student } = await requireStudentProfile();
    const submission = await prisma.examSubmission.findUnique({
      where: { id: submissionId },
      include: { exam: { include: { questions: true } }, answers: true },
    });
    if (!submission || submission.studentId !== student.id) return { ok: false, error: "Submission not found." };
    if (submission.status === "SUBMITTED" || submission.status === "GRADED") {
      return { ok: false, error: "Already submitted." }; // prevent duplicate submission
    }

    const answersByQuestion = new Map(submission.answers.map((a) => [a.questionId, a]));
    let autoScore = 0;
    let autoMax = 0;
    let hasSubjective = false;

    for (const q of submission.exam.questions) {
      const existingAnswer = answersByQuestion.get(q.id);
      if (q.type === "MCQ" || q.type === "TRUE_FALSE") {
        const isCorrect = q.correctAnswer != null && normalizeAnswer(existingAnswer?.studentAnswer) === normalizeAnswer(q.correctAnswer);
        const marksAwarded = isCorrect ? q.marks : 0;
        autoScore += marksAwarded;
        autoMax += q.marks;
        await prisma.examAnswer.upsert({
          where: { submissionId_questionId: { submissionId, questionId: q.id } },
          update: { isAutoGraded: true, isCorrect, marksAwarded },
          create: { submissionId, questionId: q.id, studentAnswer: existingAnswer?.studentAnswer, isAutoGraded: true, isCorrect, marksAwarded },
        });
      } else {
        hasSubjective = true;
        autoMax += q.marks;
      }
    }

    const timeTakenSeconds = submission.startedAt ? Math.max(0, Math.floor((Date.now() - submission.startedAt.getTime()) / 1000)) : null;

    await prisma.examSubmission.update({
      where: { id: submissionId },
      data: {
        status: "SUBMITTED",
        submittedAt: new Date(),
        timeTakenSeconds,
        // Score is provisional (auto-graded portion only) until a teacher
        // finalizes subjective marks via finalizeExamGrade(); the student
        // result page reflects `hasSubjective` to show "pending review".
        totalScore: hasSubjective ? null : autoScore,
        maxScore: submission.exam.maxMarks,
      },
    });

    if (!hasSubjective) await refreshStudentAnalytics(student.id);

    return { ok: true };
  } catch (e) {
    if (e instanceof UnauthorizedError || e instanceof ForbiddenError) return { ok: false, error: e.message };
    throw e;
  }
}

// ---------------------------------------------------------------------------
// Teacher: grading (D4)
// ---------------------------------------------------------------------------

export async function listSubmissionsForExam(examId: string) {
  await requireOwnedExam(examId);
  return prisma.examSubmission.findMany({
    where: { examId },
    include: { student: { include: { user: true } }, answers: { include: { question: true } }, grade: true },
    orderBy: { submittedAt: "asc" },
  });
}

export async function gradeExamAnswer(answerId: string, marksAwarded: number): Promise<ActionResult> {
  try {
    const session = await requireRole("teacher");
    const answer = await prisma.examAnswer.findUnique({
      where: { id: answerId },
      include: { submission: { include: { exam: { include: { teacher: true } } } }, question: true },
    });
    if (!answer) return { ok: false, error: "Answer not found." };
    if (answer.submission.exam.teacher.userId !== session.id) return { ok: false, error: "You can only grade your own exams." };
    if (marksAwarded < 0 || marksAwarded > answer.question.marks) {
      return { ok: false, error: `Marks must be between 0 and ${answer.question.marks}.` };
    }
    await prisma.examAnswer.update({ where: { id: answerId }, data: { marksAwarded, isAutoGraded: false } });
    return { ok: true };
  } catch (e) {
    if (e instanceof UnauthorizedError || e instanceof ForbiddenError) return { ok: false, error: e.message };
    throw e;
  }
}

export async function finalizeExamGrade(submissionId: string, feedback?: string): Promise<ActionResult> {
  try {
    const session = await requireRole("teacher");
    const teacher = await prisma.teacher.findUnique({ where: { userId: session.id } });
    if (!teacher) return { ok: false, error: "Teacher profile not found." };

    const submission = await prisma.examSubmission.findUnique({
      where: { id: submissionId },
      include: { exam: { include: { teacher: true } }, answers: true },
    });
    if (!submission) return { ok: false, error: "Submission not found." };
    if (submission.exam.teacher.userId !== session.id) return { ok: false, error: "You can only grade your own exams." };

    const unmarked = submission.answers.some((a) => a.marksAwarded == null);
    if (unmarked) return { ok: false, error: "All questions must be marked before finalizing." };

    const totalScore = submission.answers.reduce((sum, a) => sum + (a.marksAwarded ?? 0), 0);

    await prisma.$transaction([
      prisma.examSubmission.update({
        where: { id: submissionId },
        data: { status: "GRADED", totalScore, maxScore: submission.exam.maxMarks },
      }),
      prisma.grade.upsert({
        where: { submissionId },
        update: { totalScore, maxScore: submission.exam.maxMarks, feedback, teacherId: teacher.id },
        create: { submissionId, teacherId: teacher.id, totalScore, maxScore: submission.exam.maxMarks, feedback },
      }),
    ]);
    await refreshStudentAnalytics(submission.studentId);
    return { ok: true };
  } catch (e) {
    if (e instanceof UnauthorizedError || e instanceof ForbiddenError) return { ok: false, error: e.message };
    throw e;
  }
}

// ---------------------------------------------------------------------------
// Student: results (D5) - question-level detail (including correct
// answers) only ever returned AFTER the student's own submission exists.
// ---------------------------------------------------------------------------

export async function getExamResultForStudent(examId: string) {
  const { student } = await requireStudentProfile();
  const submission = await prisma.examSubmission.findUnique({
    where: { examId_studentId: { examId, studentId: student.id } },
    include: {
      exam: { include: { subject: true, questions: true } },
      answers: { include: { question: true } },
      grade: true,
    },
  });
  if (!submission || submission.status === "NOT_STARTED" || submission.status === "IN_PROGRESS") return null;

  const pendingReview = submission.answers.some((a) => a.marksAwarded == null);

  return {
    examTitle: submission.exam.title,
    subject: submission.exam.subject.name,
    submittedAt: submission.submittedAt,
    status: submission.status,
    pendingReview,
    totalScore: submission.totalScore,
    maxScore: submission.maxScore ?? submission.exam.maxMarks,
    feedback: submission.grade?.feedback ?? null,
    questions: submission.answers.map((a) => ({
      prompt: a.question.prompt,
      type: a.question.type,
      studentAnswer: a.studentAnswer,
      correctAnswer: a.question.type === "MCQ" || a.question.type === "TRUE_FALSE" ? a.question.correctAnswer : null,
      isCorrect: a.isCorrect,
      marksAwarded: a.marksAwarded,
      marks: a.question.marks,
    })),
  };
}

export async function listResultsForStudent() {
  const { student } = await requireStudentProfile();
  const submissions = await prisma.examSubmission.findMany({
    where: { studentId: student.id, status: { in: ["SUBMITTED", "GRADED"] } },
    include: { exam: { include: { subject: true } } },
    orderBy: { submittedAt: "desc" },
  });
  return submissions.map((s) => ({
    examId: s.examId,
    examTitle: s.exam.title,
    subject: s.exam.subject.name,
    submittedAt: s.submittedAt,
    status: s.status,
    totalScore: s.totalScore,
    maxScore: s.maxScore ?? s.exam.maxMarks,
  }));
}
