// Who may index / OCR a material: an admin of the material's own school (or a super admin), or the teacher who uploaded it - the
// same boundary as publish/delete. Shared by the indexing and OCR actions.
import { prisma } from "@/lib/prisma";
import { getCurrentSession, UnauthorizedError, ForbiddenError } from "@/lib/auth/current-session";

export async function requireManager() {
  const session = await getCurrentSession();
  if (!session) throw new UnauthorizedError();
  if (session.role === "admin") {
    const admin = await prisma.admin.findUnique({ where: { userId: session.id }, select: { isSuperAdmin: true, schoolId: true } });
    if (!admin) throw new ForbiddenError("Admin profile not found.");
    return { session, isSuperAdmin: admin.isSuperAdmin, schoolId: admin.schoolId };
  }
  if (session.role === "teacher") {
    const teacher = await prisma.teacher.findUnique({ where: { userId: session.id }, select: { schoolId: true } });
    if (!teacher) throw new ForbiddenError("Teacher profile not found.");
    return { session, isSuperAdmin: false, schoolId: teacher.schoolId };
  }
  throw new ForbiddenError("Only admins and teachers can index study materials.");
}

export type Manager = Awaited<ReturnType<typeof requireManager>>;

/** The material, only if this actor may manage it; a material of another school answers exactly like a missing one. */
export async function loadManagedMaterial(actor: Manager, materialId: string) {
  const material = await prisma.studyMaterial.findUnique({ where: { id: materialId } });
  const allowed =
    material &&
    (actor.isSuperAdmin || (actor.schoolId !== null && material.schoolId === actor.schoolId)) &&
    (actor.session.role === "admin" || material.uploadedByUserId === actor.session.id);
  return material && allowed ? material : null;
}
