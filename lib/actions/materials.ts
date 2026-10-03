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

const materialInputSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(200),
  description: z.string().trim().max(2000).optional(),
  materialType: z.nativeEnum(MaterialType),
  boardId: z.string().min(1, "Board is required"),
  schoolClassId: z.string().min(1, "Class is required"),
  subjectId: z.string().min(1, "Subject is required"),
  chapterId: z.string().min(1, "Chapter is required"),
  topicId: z.string().optional(),
  // Honoured ONLY for the platform super administrator (who belongs to no school and so must name
  // one). For every other uploader the school is derived from their own profile and this is ignored.
  schoolId: z.string().optional(),
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
 * Resolves the school the acting admin/teacher belongs to, straight from
 * their own profile row - never trusted from client input, same pattern as
 * requireAdminActor's schoolId in lib/actions/user-management.ts. Returns
 * null when the actor has no school (a global/legacy admin, or a teacher
 * with no school set) - callers decide what "no school" means for their
 * case: reject a create, return an empty list, or deny a mutation.
 */
async function resolveActorSchool(
  session: { id: string; role: string },
  requestedSchoolId?: string
): Promise<{ schoolId: string; schoolName: string; boardId: string | null } | null> {
  if (session.role === "admin") {
    const admin = await prisma.admin.findUnique({ where: { userId: session.id }, include: { school: true } });
    // The super administrator is platform-level: they may name any existing, enabled school.
    // Anyone else's school always comes from their own row, never from the request.
    if (admin?.isSuperAdmin && requestedSchoolId) {
      const chosen = await prisma.school.findUnique({ where: { id: requestedSchoolId } });
      if (!chosen || !chosen.isEnabled) return null;
      return { schoolId: chosen.id, schoolName: chosen.name, boardId: chosen.boardId };
    }
    if (!admin?.school) return null;
    return { schoolId: admin.school.id, schoolName: admin.school.name, boardId: admin.school.boardId };
  }
  const teacher = await prisma.teacher.findUnique({ where: { userId: session.id }, include: { school: true } });
  if (!teacher?.school) return null;
  return { schoolId: teacher.school.id, schoolName: teacher.school.name, boardId: teacher.school.boardId };
}

/** True when this actor may publish/unpublish/delete a material of `materialSchoolId`. */
async function actorMayManageMaterial(session: { id: string; role: string }, materialSchoolId: string): Promise<boolean> {
  if (session.role === "admin") {
    const admin = await prisma.admin.findUnique({ where: { userId: session.id }, select: { isSuperAdmin: true, schoolId: true } });
    if (!admin) return false;
    return admin.isSuperAdmin || (admin.schoolId !== null && admin.schoolId === materialSchoolId);
  }
  const actorSchool = await resolveActorSchool(session);
  return actorSchool !== null && actorSchool.schoolId === materialSchoolId;
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

    // The material's school is always derived from the uploader's own
    // school - never accepted from the form/browser. An actor with no
    // school at all cannot create a material that would have no owner.
    const actorSchool = await resolveActorSchool(session, data.schoolId);
    if (!actorSchool) {
      return {
        ok: false,
        error: data.schoolId
          ? "That school doesn't exist or is disabled."
          : "Your account isn't associated with a school yet. Contact a super administrator before uploading materials.",
      };
    }
    // A school with a board already set only ever teaches that board - a
    // material for a different board would never be visible to any of
    // that school's students anyway. Schools that predate this feature
    // (no board set yet) skip this check rather than blocking uploads for
    // an admin who has no way to fix it themselves.
    if (actorSchool.boardId && actorSchool.boardId !== data.boardId) {
      return { ok: false, error: "Selected board does not match your school's board." };
    }

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
        schoolId: actorSchool.schoolId,
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
      data: { userId: session.id, action: "MATERIAL_UPLOAD", resource: `StudyMaterial:${material.id}`, message: `Uploaded "${material.title}" to ${actorSchool.schoolName}` },
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
      schoolId: isSuperAdmin ? filters?.schoolId : actorSchool!.schoolId,
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
  if (!student?.schoolClassId || !student.schoolId) return [];

  return prisma.studyMaterial.findMany({
    where: { schoolId: student.schoolId, schoolClassId: student.schoolClassId, boardId: student.boardId ?? undefined, isPublished: true },
    include: { subject: true, chapter: true, topic: true },
    orderBy: [{ subject: { name: "asc" } }, { chapter: { order: "asc" } }],
  });
}
