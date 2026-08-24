"use server";

// Worksheet CRUD (Stage C3). A teacher may only create/edit/delete
// worksheets for a class+subject they are actually assigned to
// (TeacherAssignment) - enforced server-side on every mutation, not just
// hidden in the UI.
import { z } from "zod";
import { prisma } from "@/lib/prisma";
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

async function requireOwnedTeacherAssignment(schoolClassId: string, subjectId: string) {
  const session = await requireRole("teacher");
  const teacher = await prisma.teacher.findUnique({ where: { userId: session.id } });
  if (!teacher) throw new ForbiddenError("Teacher profile not found.");
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

    const { teacher } = await requireOwnedTeacherAssignment(data.schoolClassId, data.subjectId);

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

    await prisma.worksheet.update({
      where: { id: worksheetId },
      data: {
        title: data.title,
        description: data.instructions,
        chapterId: data.chapterId || null,
        topicId: data.topicId || null,
        dueDate: data.dueDate ? new Date(data.dueDate) : null,
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
  if (!student?.schoolClassId) return [];
  return prisma.worksheet.findMany({
    where: { schoolClassId: student.schoolClassId, isPublished: true },
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

    const worksheet = await prisma.worksheet.findUnique({ where: { id: worksheetId } });
    if (!worksheet || !worksheet.isPublished || worksheet.schoolClassId !== student.schoolClassId) {
      return { ok: false, error: "Worksheet not found." };
    }

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
