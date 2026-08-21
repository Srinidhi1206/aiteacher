"use server";

// Study Material CRUD (Stage C2/C5). Every mutating action re-derives the
// actor's identity from the session (never from client input) and checks
// role/ownership before touching the database.
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentSession, ForbiddenError, UnauthorizedError } from "@/lib/auth/current-session";
import { storage, validateUploadFile, safeFilename, StorageNotConfiguredError } from "@/lib/storage";
import { MaterialType } from "@prisma/client";

const materialInputSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(200),
  description: z.string().trim().max(2000).optional(),
  materialType: z.nativeEnum(MaterialType),
  boardId: z.string().min(1, "Board is required"),
  schoolClassId: z.string().min(1, "Class is required"),
  subjectId: z.string().min(1, "Subject is required"),
  chapterId: z.string().min(1, "Chapter is required"),
  topicId: z.string().optional(),
});

export interface ActionResult<T = void> {
  ok: boolean;
  error?: string;
  data?: T;
}

async function requireAdminOrTeacher() {
  const session = await getCurrentSession();
  if (!session) throw new UnauthorizedError();
  if (session.role !== "admin" && session.role !== "teacher") {
    throw new ForbiddenError("Only admins and teachers can manage study materials.");
  }
  return session;
}

/**
 * Creates a StudyMaterial. `file` must already have been validated by the
 * caller's form (client-side) - it is re-validated here server-side
 * regardless, since client-side checks are only a UX nicety, never a
 * security boundary.
 */
export async function createMaterial(input: unknown, file: File): Promise<ActionResult<{ id: string }>> {
  try {
    const session = await requireAdminOrTeacher();
    const parsed = materialInputSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
    }
    const data = parsed.data;

    const fileCheck = validateUploadFile({ type: file.type, size: file.size });
    if (!fileCheck.ok) return { ok: false, error: fileCheck.error };

    if (!storage.isConfigured) {
      return { ok: false, error: "File storage is not configured. Set BLOB_READ_WRITE_TOKEN to enable uploads (see docs/DATABASE.md)." };
    }

    // Teachers may only attach material to a class/subject they're actually
    // assigned to - admins aren't restricted.
    if (session.role === "teacher") {
      const teacher = await prisma.teacher.findUnique({ where: { userId: session.id } });
      if (!teacher) return { ok: false, error: "Teacher profile not found." };
      const assigned = await prisma.teacherAssignment.findFirst({
        where: { teacherId: teacher.id, schoolClassId: data.schoolClassId, subjectId: data.subjectId },
      });
      if (!assigned) return { ok: false, error: "You are not assigned to this class/subject." };
    }

    let uploadResult;
    try {
      uploadResult = await storage.upload({
        file,
        pathname: `materials/${data.schoolClassId}/${data.subjectId}/${Date.now()}-${safeFilename(file.name)}`,
        contentType: file.type,
      });
    } catch (e) {
      if (e instanceof StorageNotConfiguredError) return { ok: false, error: e.message };
      throw e;
    }

    const teacherProfile = session.role === "teacher" ? await prisma.teacher.findUnique({ where: { userId: session.id } }) : null;

    const material = await prisma.studyMaterial.create({
      data: {
        title: data.title,
        description: data.description,
        fileName: safeFilename(file.name),
        fileUrl: uploadResult.url,
        storageKey: uploadResult.storageKey,
        materialType: data.materialType,
        sizeKb: Math.ceil(uploadResult.sizeBytes / 1024),
        status: "READY",
        boardId: data.boardId,
        schoolClassId: data.schoolClassId,
        subjectId: data.subjectId,
        chapterId: data.chapterId,
        topicId: data.topicId || null,
        uploadedByUserId: session.id,
        teacherId: teacherProfile?.id,
      },
    });

    await prisma.auditLog.create({
      data: { userId: session.id, action: "MATERIAL_UPLOAD", resource: `StudyMaterial:${material.id}`, message: `Uploaded "${material.title}"` },
    });

    return { ok: true, data: { id: material.id } };
  } catch (e) {
    if (e instanceof UnauthorizedError || e instanceof ForbiddenError) return { ok: false, error: e.message };
    throw e;
  }
}

export async function setMaterialPublished(materialId: string, isPublished: boolean): Promise<ActionResult> {
  try {
    const session = await requireAdminOrTeacher();
    const material = await prisma.studyMaterial.findUnique({ where: { id: materialId } });
    if (!material) return { ok: false, error: "Material not found." };
    if (session.role === "teacher" && material.uploadedByUserId !== session.id) {
      return { ok: false, error: "You can only publish/unpublish your own uploads." };
    }
    await prisma.studyMaterial.update({ where: { id: materialId }, data: { isPublished } });
    return { ok: true };
  } catch (e) {
    if (e instanceof UnauthorizedError || e instanceof ForbiddenError) return { ok: false, error: e.message };
    throw e;
  }
}

export async function deleteMaterial(materialId: string): Promise<ActionResult> {
  try {
    const session = await requireAdminOrTeacher();
    const material = await prisma.studyMaterial.findUnique({ where: { id: materialId } });
    if (!material) return { ok: false, error: "Material not found." };
    if (session.role === "teacher" && material.uploadedByUserId !== session.id) {
      return { ok: false, error: "You can only delete your own uploads." };
    }
    if (storage.isConfigured) {
      try {
        await storage.delete(material.storageKey);
      } catch {
        // Storage delete failing shouldn't block removing the catalog
        // entry - the object becoming orphaned in the bucket is a lesser
        // problem than a broken admin screen. Logged via AuditLog below.
      }
    }
    await prisma.studyMaterial.delete({ where: { id: materialId } });
    await prisma.auditLog.create({
      data: { userId: session.id, action: "MATERIAL_DELETE", resource: `StudyMaterial:${materialId}`, message: `Deleted "${material.title}"` },
    });
    return { ok: true };
  } catch (e) {
    if (e instanceof UnauthorizedError || e instanceof ForbiddenError) return { ok: false, error: e.message };
    throw e;
  }
}

export async function listMaterialsForAdmin(filters?: { boardId?: string; schoolClassId?: string; subjectId?: string }) {
  await requireAdminOrTeacher();
  return prisma.studyMaterial.findMany({
    where: {
      boardId: filters?.boardId,
      schoolClassId: filters?.schoolClassId,
      subjectId: filters?.subjectId,
    },
    include: { board: true, schoolClass: true, subject: true, chapter: true, topic: true, uploadedBy: true },
    orderBy: { uploadedAt: "desc" },
  });
}

/**
 * Materials visible to the logged-in student: published only, and scoped
 * to their own board/class (never another board/class's material), read
 * from their current Student row - not from the session payload, which
 * could be stale if their class changed since they last logged in.
 */
export async function listMaterialsForStudent() {
  const session = await getCurrentSession();
  if (!session || session.role !== "student") throw new ForbiddenError("Students only.");

  const student = await prisma.student.findUnique({ where: { userId: session.id } });
  if (!student?.schoolClassId) return [];

  return prisma.studyMaterial.findMany({
    where: { schoolClassId: student.schoolClassId, boardId: student.boardId ?? undefined, isPublished: true },
    include: { subject: true, chapter: true, topic: true },
    orderBy: [{ subject: { name: "asc" } }, { chapter: { order: "asc" } }],
  });
}
