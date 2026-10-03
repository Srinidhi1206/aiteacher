"use server";

// Study Material CRUD (Stage C2/C5). Every mutating action re-derives the
// actor's identity from the session (never from client input) and checks
// role/ownership before touching the database.
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentSession, ForbiddenError, UnauthorizedError } from "@/lib/auth/current-session";
import { storage, validateUploadFile, safeFilename, StorageNotConfiguredError } from "@/lib/storage";
import { MaterialType } from "@prisma/client";
import { checkMaterialPlacement } from "@/lib/materials/placement";
import { logAudit } from "@/lib/audit";
import { notifyQuietly, audienceForMaterial } from "@/lib/notifications/core";
import { studentMaterialWhere } from "@/lib/materials/scope";
import { changeMaterialScopeCore } from "@/lib/materials/share";
import { resolveActorSchool as resolveActorSchoolFor, actorMayManageMaterial as actorMayManageMaterialFor, resolveMaterialTarget } from "@/lib/materials/owner";

const materialInputSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(200),
  description: z.string().trim().max(2000).optional(),
  materialType: z.nativeEnum(MaterialType),
  boardId: z.string().min(1, "Board is required"),
  schoolClassId: z.string().min(1, "Class is required"),
  subjectId: z.string().min(1, "Subject is required"),
  // Optional: a whole-subject material (for example a complete textbook) is not tied to one chapter.
  chapterId: z.string().optional(),
  topicId: z.string().optional(),
  // Honoured ONLY for the platform super administrator (who belongs to no school and so must name
  // one). For every other uploader the school is derived from their own profile and this is ignored.
  schoolId: z.string().optional(),
  // true = common material, shared by every school on this board + class. Super administrator only.
  common: z.boolean().optional(),
});

export interface ActionResult<T = void> {
  ok: boolean;
  error?: string;
  data?: T;
}

const resolveActorSchool = (session: { id: string; role: string }, requestedSchoolId?: string) => resolveActorSchoolFor(prisma, session, requestedSchoolId);
const actorMayManageMaterial = (session: { id: string; role: string }, materialSchoolId: string | null) => actorMayManageMaterialFor(prisma, session, materialSchoolId);

async function requireAdminOrTeacher() {
  const session = await getCurrentSession();
  if (!session) throw new UnauthorizedError();
  if (session.role !== "admin" && session.role !== "teacher") {
    throw new ForbiddenError("Only admins and teachers can manage study materials.");
  }
  return session;
}

/**
 * Creates a StudyMaterial for a file already uploaded directly from the
 * browser to Blob storage (see app/api/materials/upload/route.ts and
 * components/admin/study-materials-card.tsx) - this action never receives
 * or re-uploads the file's bytes itself, only the pathname the client
 * uploaded to. That pathname is not a secret and isn't trusted for
 * anything: `storage.getMetadata()` re-derives the real size/contentType/
 * url directly from the storage provider before anything is validated or
 * written, so a crafted `fileRef` pointing at an arbitrary/nonexistent
 * pathname fails the metadata lookup rather than creating a row.
 */
export async function createMaterial(
  input: unknown,
  fileRef: { storageKey: string; fileName: string }
): Promise<ActionResult<{ id: string }>> {
  try {
    const session = await requireAdminOrTeacher();
    const parsed = materialInputSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
    }
    const data = parsed.data;

    // The dropdowns keep these consistent, but a crafted request must not be able to file a material under
    // a class, subject or chapter that doesn't belong together.
    const placementProblem = await checkMaterialPlacement(data);
    if (placementProblem) return { ok: false, error: placementProblem };

    // Who the material belongs to is decided server-side (lib/materials/owner.ts): a school administrator or teacher
    // always uploads to their own school, only the super administrator can name a school or create a COMMON material.
    const resolved = await resolveMaterialTarget(prisma, session, data);
    if (!resolved.ok) return { ok: false, error: resolved.error };
    const target = resolved.target;

    if (!storage.isConfigured) {
      return { ok: false, error: "File storage is not configured. Set BLOB_READ_WRITE_TOKEN to enable uploads (see docs/DATABASE.md)." };
    }

    let meta;
    try {
      meta = await storage.getMetadata(fileRef.storageKey);
    } catch (e) {
      if (e instanceof StorageNotConfiguredError) return { ok: false, error: e.message };
      return { ok: false, error: "Could not verify the uploaded file - please try uploading again." };
    }

    const fileCheck = validateUploadFile({ type: meta.contentType, size: meta.size });
    if (!fileCheck.ok) return { ok: false, error: fileCheck.error };

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

    const teacherProfile = session.role === "teacher" ? await prisma.teacher.findUnique({ where: { userId: session.id } }) : null;

    const material = await prisma.studyMaterial.create({
      data: {
        title: data.title,
        description: data.description,
        fileName: safeFilename(fileRef.fileName),
        fileUrl: meta.url,
        storageKey: fileRef.storageKey,
        materialType: data.materialType,
        sizeKb: Math.ceil(meta.size / 1024),
        status: "READY",
        schoolId: target.schoolId,
        boardId: data.boardId,
        schoolClassId: data.schoolClassId,
        subjectId: data.subjectId,
        chapterId: data.chapterId || null,
        topicId: data.topicId || null,
        uploadedByUserId: session.id,
        teacherId: teacherProfile?.id,
      },
    });

    await prisma.auditLog.create({
      data: { userId: session.id, action: "MATERIAL_UPLOAD", resource: `StudyMaterial:${material.id}`, message: `Uploaded "${material.title}" to ${target.schoolName}` },
    });

    // A material that goes live on upload tells the students it is for. (A draft notifies when it is published.)
    if (material.isPublished) {
      await notifyQuietly(audienceForMaterial(material), { type: "MATERIAL", title: "New study material", message: `"${material.title}" is now available in Study Materials.` });
    }

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
    // Deliberately the same "Material not found" message for a real
    // cross-school id as for a genuinely missing one - an admin/teacher
    // from another school shouldn't be able to tell the two apart.
    if (!material || !(await actorMayManageMaterial(session, material.schoolId))) {
      return { ok: false, error: "Material not found." };
    }
    if (session.role === "teacher" && material.uploadedByUserId !== session.id) {
      return { ok: false, error: "You can only publish/unpublish your own uploads." };
    }
    await prisma.studyMaterial.update({ where: { id: materialId }, data: { isPublished } });
    await logAudit(session.id, "USER_UPDATE", `StudyMaterial:${materialId}`, `Material ${isPublished ? "published" : "unpublished"}: "${material.title}"`);
    // Only the switch from draft to published tells students; toggling an already-published item does not repeat it.
    if (isPublished && !material.isPublished) {
      await notifyQuietly(audienceForMaterial(material), { type: "MATERIAL", title: "New study material", message: `"${material.title}" is now available in Study Materials.` });
    }
    return { ok: true };
  } catch (e) {
    if (e instanceof UnauthorizedError || e instanceof ForbiddenError) return { ok: false, error: e.message };
    throw e;
  }
}

/**
 * Super administrator only: shares an existing material with every school on its board + class ("common"), or hands it
 * back to one school. The file, its indexed passages and its publish state are untouched - only who owns it changes, so
 * the same textbook never has to be uploaded (or indexed, which costs embedding quota) once per school.
 */
export async function setMaterialScope(materialId: string, target: { common: true } | { schoolId: string }): Promise<ActionResult<{ message: string }>> {
  try {
    const session = await requireAdminOrTeacher();
    const admin = session.role === "admin" ? await prisma.admin.findUnique({ where: { userId: session.id }, select: { isSuperAdmin: true } }) : null;
    if (admin?.isSuperAdmin !== true) return { ok: false, error: "Only the super administrator can share a material with every school." };

    const result = await changeMaterialScopeCore(prisma, materialId, target);
    if (!result.ok) return { ok: false, error: result.error };

    const where = result.to === null ? "now shared with every school on its board and class" : "now private to one school";
    await logAudit(session.id, "USER_UPDATE", `StudyMaterial:${materialId}`, `Material ${where}: "${result.title}" (${result.passages} indexed passages moved with it)`);
    return { ok: true, data: { message: `"${result.title}" is ${where}.` } };
  } catch (e) {
    if (e instanceof UnauthorizedError || e instanceof ForbiddenError) return { ok: false, error: e.message };
    throw e;
  }
}

export async function deleteMaterial(materialId: string): Promise<ActionResult> {
  try {
    const session = await requireAdminOrTeacher();
    const material = await prisma.studyMaterial.findUnique({ where: { id: materialId } });
    if (!material || !(await actorMayManageMaterial(session, material.schoolId))) {
      return { ok: false, error: "Material not found." };
    }
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

/**
 * Materials visible to the acting admin/teacher: their own school only,
 * derived from their own profile row - never a client-supplied schoolId.
 * An actor with no school sees an empty list rather than every school's
 * materials (the safe default, not a crash).
 */
export async function listMaterialsForAdmin(filters?: { boardId?: string; schoolClassId?: string; subjectId?: string; schoolId?: string }) {
  const session = await requireAdminOrTeacher();
  // The super administrator sees every school's materials (optionally narrowed to one school);
  // everyone else is pinned to their own school and any schoolId filter is ignored.
  const isSuperAdmin =
    session.role === "admin" &&
    (await prisma.admin.findUnique({ where: { userId: session.id }, select: { isSuperAdmin: true } }))?.isSuperAdmin === true;
  const actorSchool = isSuperAdmin ? null : await resolveActorSchool(session);
  if (!isSuperAdmin && !actorSchool) return [];

  return prisma.studyMaterial.findMany({
    where: {
      // "common" (super administrator only) narrows to materials that belong to no school.
      schoolId: isSuperAdmin ? (filters?.schoolId === "common" ? null : filters?.schoolId) : actorSchool!.schoolId,
      boardId: filters?.boardId,
      schoolClassId: filters?.schoolClassId,
      subjectId: filters?.subjectId,
    },
    include: { school: true, board: true, schoolClass: true, subject: true, chapter: true, topic: true, uploadedBy: { omit: { passwordHash: true } }, _count: { select: { chunks: true } } },
    orderBy: { uploadedAt: "desc" },
  });
}

/**
 * Materials visible to the logged-in student: published only, and scoped
 * to their own school + board + class (never another school's or another
 * board/class's material), read from their current Student row - not from
 * the session payload, which could be stale if their school/class changed
 * since they last logged in.
 */
export async function listMaterialsForStudent() {
  const session = await getCurrentSession();
  if (!session || session.role !== "student") throw new ForbiddenError("Students only.");

  const student = await prisma.student.findUnique({ where: { userId: session.id } });
  const where = student ? studentMaterialWhere(student) : null;
  if (!where) return [];

  return prisma.studyMaterial.findMany({
    where,
    include: { subject: true, chapter: true, topic: true },
    orderBy: [{ subject: { name: "asc" } }, { chapter: { order: "asc" } }],
  });
}
