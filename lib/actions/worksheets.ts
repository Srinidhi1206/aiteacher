"use server";

// Worksheet CRUD (Stage C3). A teacher may only create/edit/delete
// worksheets for a class+subject they are actually assigned to
// (TeacherAssignment) - enforced server-side on every mutation, not just
// hidden in the UI.
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { notifyQuietly, audienceForClassInSchool } from "@/lib/notifications/core";
import { getCurrentSession, requireRole, ForbiddenError, UnauthorizedError } from "@/lib/auth/current-session";
import { storage, validateUploadFile, safeFilename, StorageNotConfiguredError } from "@/lib/storage";
import type { ActionResult } from "./materials";

const worksheetInputSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(200),
  instructions: z.string().trim().max(4000).optional(),
  schoolClassId: z.string().min(1, "Class is required"),
  subjectId: z.string().min(1, "Subject is required"),
  chapterId: z.string().optional(),
  topicId: z.string().optional(),
  dueDate: z.string().datetime().optional(),
});

const PAST_DUE_MESSAGE = "The due date can't be in the past.";

/** A due date is a calendar day picked in the teacher's own timezone, so allow a day and a half of slack rather than comparing to the exact instant. */
function isPastDue(dueDate: string): boolean {
  return new Date(dueDate).getTime() < Date.now() - 36 * 60 * 60 * 1000;
}

async function requireOwnedTeacherAssignment(schoolClassId: string, subjectId: string) {
  const session = await requireRole("teacher");
  const teacher = await prisma.teacher.findUnique({ where: { userId: session.id } });
  if (!teacher) throw new ForbiddenError("Teacher profile not found.");
  // A worksheet's school is its author's school (there is no column of its
  // own) - see the note on requireOwnedAssignment in exams.ts.
  if (!teacher.schoolId) {
    throw new ForbiddenError("Your account isn't associated with a school yet. Contact a school administrator.");
  }
  const assigned = await prisma.teacherAssignment.findFirst({
    where: { teacherId: teacher.id, schoolClassId, subjectId },
  });
  if (!assigned) throw new ForbiddenError("You are not assigned to this class/subject.");
  return { session, teacher };
}

export async function createWorksheet(input: unknown, file?: File | null): Promise<ActionResult<{ id: string }>> {
  try {
    const parsed = worksheetInputSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
    const data = parsed.data;

    const { session, teacher } = await requireOwnedTeacherAssignment(data.schoolClassId, data.subjectId);

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
          pathname: `worksheets/${data.schoolClassId}/${data.subjectId}/${Date.now()}-${safeFilename(file.name)}`,
          contentType: file.type,
        });
        fileUrl = uploaded.url;
        storageKey = uploaded.storageKey;
      } catch (e) {
        if (e instanceof StorageNotConfiguredError) return { ok: false, error: e.message };
        throw e;
      }
    }

    if (data.dueDate && isPastDue(data.dueDate)) return { ok: false, error: PAST_DUE_MESSAGE };

    const worksheet = await prisma.worksheet.create({
      data: {
        title: data.title,
        description: data.instructions,
        fileName: file?.name ? safeFilename(file.name) : undefined,
        fileUrl,
        storageKey,
        teacherId: teacher.id,
        schoolClassId: data.schoolClassId,
        subjectId: data.subjectId,
        chapterId: data.chapterId || null,
        topicId: data.topicId || null,
        dueDate: data.dueDate ? new Date(data.dueDate) : null,
      },
    });
    await logAudit(session.id, "USER_UPDATE", `Worksheet:${worksheet.id}`, `Assignment created (draft): "${worksheet.title}"`);
    return { ok: true, data: { id: worksheet.id } };
  } catch (e) {
    if (e instanceof UnauthorizedError || e instanceof ForbiddenError) return { ok: false, error: e.message };
    throw e;
  }
}

const worksheetUpdateSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(200),
  instructions: z.string().trim().max(4000).optional(),
  chapterId: z.string().optional(),
  topicId: z.string().optional(),
  dueDate: z.string().datetime().optional(),
});

/** Edits a worksheet's descriptive fields. Class/subject are fixed at creation - changing them would need a fresh TeacherAssignment scope check, so a class/subject change is a new worksheet, not an edit. */
export async function updateWorksheet(worksheetId: string, input: unknown): Promise<ActionResult> {
  try {
    const session = await requireRole("teacher");
    const worksheet = await prisma.worksheet.findUnique({ where: { id: worksheetId }, include: { teacher: true } });
    if (!worksheet) return { ok: false, error: "Worksheet not found." };
    if (worksheet.teacher.userId !== session.id) return { ok: false, error: "You can only edit your own worksheets." };

    const parsed = worksheetUpdateSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
    const data = parsed.data;
    // Editing other fields of an already-overdue worksheet is fine; only a NEW past date is refused.
    const dueChanged = !worksheet.dueDate || !data.dueDate || worksheet.dueDate.getTime() !== new Date(data.dueDate).getTime();
    if (data.dueDate && dueChanged && isPastDue(data.dueDate)) return { ok: false, error: PAST_DUE_MESSAGE };

    await prisma.worksheet.update({
      where: { id: worksheetId },
      // Only fields the caller actually sent are changed - an edit that sends just a
      // new title must not wipe the due date, chapter or topic.
      data: {
        title: data.title,
        ...(data.instructions !== undefined ? { description: data.instructions || null } : {}),
        ...(data.chapterId !== undefined ? { chapterId: data.chapterId || null } : {}),
        ...(data.topicId !== undefined ? { topicId: data.topicId || null } : {}),
        ...(data.dueDate !== undefined ? { dueDate: new Date(data.dueDate) } : {}),
      },
    });
    return { ok: true };
  } catch (e) {
    if (e instanceof UnauthorizedError || e instanceof ForbiddenError) return { ok: false, error: e.message };
    throw e;
  }
}

export async function setWorksheetPublished(worksheetId: string, isPublished: boolean): Promise<ActionResult> {
  try {
    const session = await requireRole("teacher");
    const worksheet = await prisma.worksheet.findUnique({ where: { id: worksheetId }, include: { teacher: true } });
    if (!worksheet) return { ok: false, error: "Worksheet not found." };
    if (worksheet.teacher.userId !== session.id) return { ok: false, error: "You can only publish/unpublish your own worksheets." };
    await prisma.worksheet.update({ where: { id: worksheetId }, data: { isPublished } });
    await logAudit(session.id, "USER_UPDATE", `Worksheet:${worksheetId}`, `Assignment ${isPublished ? "published" : "unpublished"}: "${worksheet.title}"`);
    if (isPublished && !worksheet.isPublished && worksheet.teacher.schoolId) {
      await notifyQuietly(audienceForClassInSchool({ schoolId: worksheet.teacher.schoolId, schoolClassId: worksheet.schoolClassId }), {
        type: "ASSIGNMENT",
        title: "New assignment",
        message: `"${worksheet.title}"${worksheet.dueDate ? ` - due ${worksheet.dueDate.toISOString().slice(0, 10)}` : ""}.`,
      });
    }
    return { ok: true };
  } catch (e) {
    if (e instanceof UnauthorizedError || e instanceof ForbiddenError) return { ok: false, error: e.message };
    throw e;
  }
}

export async function deleteWorksheet(worksheetId: string): Promise<ActionResult> {
  try {
    const session = await requireRole("teacher");
    const worksheet = await prisma.worksheet.findUnique({ where: { id: worksheetId }, include: { teacher: true } });
    if (!worksheet) return { ok: false, error: "Worksheet not found." };
    if (worksheet.teacher.userId !== session.id) return { ok: false, error: "You can only delete your own worksheets." };
    if (worksheet.storageKey && storage.isConfigured) {
      try {
        await storage.delete(worksheet.storageKey);
      } catch {
        // Same reasoning as deleteMaterial - don't block the DB delete on a storage hiccup.
      }
    }
    await prisma.worksheet.delete({ where: { id: worksheetId } });
    await logAudit(session.id, "USER_UPDATE", `Worksheet:${worksheetId}`, `Assignment deleted: "${worksheet.title}"`);
    return { ok: true };
  } catch (e) {
    if (e instanceof UnauthorizedError || e instanceof ForbiddenError) return { ok: false, error: e.message };
    throw e;
  }
}

export async function listWorksheetsForTeacher() {
  const session = await requireRole("teacher");
  const teacher = await prisma.teacher.findUnique({ where: { userId: session.id } });
  if (!teacher) return [];
  return prisma.worksheet.findMany({
    where: { teacherId: teacher.id },
    include: { schoolClass: true, subject: true, chapter: true, submissions: true },
    orderBy: { createdAt: "desc" },
  });
}

export async function listWorksheetsForStudent() {
  const session = await getCurrentSession();
  if (!session || session.role !== "student") throw new ForbiddenError("Students only.");
  const student = await prisma.student.findUnique({ where: { userId: session.id } });
  if (!student?.schoolClassId || !student.schoolId) return [];
  return prisma.worksheet.findMany({
    where: { schoolClassId: student.schoolClassId, isPublished: true, teacher: { schoolId: student.schoolId } },
    include: {
      subject: true,
      chapter: true,
      submissions: { where: { studentId: student.id } },
    },
    orderBy: { dueDate: "asc" },
  });
}

export async function submitWorksheet(worksheetId: string): Promise<ActionResult> {
  try {
    const session = await requireRole("student");
    const student = await prisma.student.findUnique({ where: { userId: session.id } });
    if (!student) return { ok: false, error: "Student profile not found." };

    const worksheet = await prisma.worksheet.findUnique({ where: { id: worksheetId }, include: { teacher: { select: { schoolId: true } } } });
    if (
      !worksheet ||
      !worksheet.isPublished ||
      worksheet.schoolClassId !== student.schoolClassId ||
      !student.schoolId ||
      worksheet.teacher.schoolId !== student.schoolId
    ) {
      return { ok: false, error: "Worksheet not found." };
    }

    // Once a teacher has graded it, the work is final - a later "submit" must
    // not silently reset the submission time under a score already given.
    const existing = await prisma.worksheetSubmission.findUnique({ where: { worksheetId_studentId: { worksheetId, studentId: student.id } } });
    if (existing?.score != null) return { ok: false, error: "This assignment has already been graded." };

    await prisma.worksheetSubmission.upsert({
      where: { worksheetId_studentId: { worksheetId, studentId: student.id } },
      update: { submittedAt: new Date() },
      create: { worksheetId, studentId: student.id, submittedAt: new Date() },
    });
    return { ok: true };
  } catch (e) {
    if (e instanceof UnauthorizedError || e instanceof ForbiddenError) return { ok: false, error: e.message };
    throw e;
  }
}

export interface WorksheetSubmissionRow {
  studentId: string;
  name: string;
  submissionId: string | null;
  submittedAt: Date | null;
  score: number | null;
  maxScore: number | null;
  feedback: string | null;
}

/**
 * Who has and hasn't handed in one of the teacher's own worksheets: the
 * ACTIVE students of that class in the teacher's own school (a class row is
 * shared by every school on the board, so the school has to match too), each
 * with their submission if any. Only the worksheet's own teacher may look.
 */
export async function listWorksheetSubmissions(worksheetId: string): Promise<ActionResult<{ rows: WorksheetSubmissionRow[] }>> {
  try {
    const session = await requireRole("teacher");
    const worksheet = await prisma.worksheet.findUnique({ where: { id: worksheetId }, include: { teacher: { select: { userId: true, schoolId: true } } } });
    if (!worksheet || worksheet.teacher.userId !== session.id || !worksheet.teacher.schoolId) {
      return { ok: false, error: "Worksheet not found." };
    }
    const students = await prisma.student.findMany({
      where: { schoolClassId: worksheet.schoolClassId, schoolId: worksheet.teacher.schoolId, user: { status: "ACTIVE" } },
      select: { id: true, user: { select: { name: true } } },
      orderBy: { user: { name: "asc" } },
    });
    const submissions = await prisma.worksheetSubmission.findMany({
      where: { worksheetId, studentId: { in: students.map((s) => s.id) } },
    });
    const byStudent = new Map(submissions.map((s) => [s.studentId, s]));
    return {
      ok: true,
      data: {
        rows: students.map((s) => {
          const sub = byStudent.get(s.id);
          return {
            studentId: s.id,
            name: s.user.name,
            submissionId: sub?.submittedAt ? sub.id : null,
            submittedAt: sub?.submittedAt ?? null,
            score: sub?.score ?? null,
            maxScore: sub?.maxScore ?? null,
            feedback: sub?.feedback ?? null,
          };
        }),
      },
    };
  } catch (e) {
    if (e instanceof UnauthorizedError || e instanceof ForbiddenError) return { ok: false, error: e.message };
    throw e;
  }
}

export async function gradeWorksheetSubmission(
  submissionId: string,
  score: number,
  maxScore: number,
  feedback?: string
): Promise<ActionResult> {
  try {
    const session = await requireRole("teacher");
    const submission = await prisma.worksheetSubmission.findUnique({
      where: { id: submissionId },
      include: { worksheet: { include: { teacher: true } } },
    });
    if (!submission) return { ok: false, error: "Submission not found." };
    if (submission.worksheet.teacher.userId !== session.id) {
      return { ok: false, error: "You can only grade submissions for your own worksheets." };
    }
    if (!submission.submittedAt) return { ok: false, error: "This student has not submitted yet." };
    // Stage K: worksheets have no fixed per-question mark scheme the way
    // exams do (see gradeExamAnswer's 0-to-question.marks check), so score
    // and maxScore are both teacher-supplied per submission - but they
    // still need bounds checking. Without this, a malformed or malicious
    // value (negative, non-finite, score > maxScore) would be persisted
    // as-is and silently corrupt any progress %/analytics that later
    // divides score by maxScore.
    if (!Number.isFinite(score) || !Number.isFinite(maxScore)) {
      return { ok: false, error: "Score and max score must be valid numbers." };
    }
    if (maxScore <= 0) return { ok: false, error: "Max score must be greater than 0." };
    if (score < 0 || score > maxScore) {
      return { ok: false, error: `Score must be between 0 and ${maxScore}.` };
    }
    await prisma.worksheetSubmission.update({
      where: { id: submissionId },
      data: { score, maxScore, feedback },
    });
    return { ok: true };
  } catch (e) {
    if (e instanceof UnauthorizedError || e instanceof ForbiddenError) return { ok: false, error: e.message };
    throw e;
  }
}
