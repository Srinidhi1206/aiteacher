// Who owns a study material, and who may change it. Kept apart from the server actions in lib/actions/materials.ts
// so the rules take the database handle as a parameter and can be tested against a real database.
//
//   COMMON material  (schoolId NULL): belongs to the platform - shared by every school on its board + class. Only the
//                    super administrator may create, publish, unpublish, index or delete it.
//   PRIVATE material (schoolId = X) : belongs to that school. Its administrators and the teacher who uploaded it manage
//                    it; the super administrator manages every school's.
//
// The owning school is never taken from the browser: a school administrator or teacher always uploads to their OWN
// school, and only the super administrator (who belongs to none) names a school - which must exist and be enabled.
import type { prisma } from "@/lib/prisma";

export type OwnerDb = Pick<typeof prisma, "admin" | "teacher" | "school">;
export interface OwnerActor {
  id: string;
  role: string;
}
export interface OwnerTarget {
  schoolId: string | null;
  schoolName: string;
  boardId: string | null;
}

/**
 * The school an admin/teacher belongs to, from their own profile row. Returns null when they have none (a global
 * admin without a school, or a teacher with no school). The super administrator may instead name any existing,
 * enabled school.
 */
export async function resolveActorSchool(
  db: OwnerDb,
  session: OwnerActor,
  requestedSchoolId?: string
): Promise<{ schoolId: string; schoolName: string; boardId: string | null } | null> {
  if (session.role === "admin") {
    const admin = await db.admin.findUnique({ where: { userId: session.id }, include: { school: true } });
    if (admin?.isSuperAdmin && requestedSchoolId) {
      const chosen = await db.school.findUnique({ where: { id: requestedSchoolId } });
      if (!chosen || !chosen.isEnabled) return null;
      return { schoolId: chosen.id, schoolName: chosen.name, boardId: chosen.boardId };
    }
    if (!admin?.school) return null;
    return { schoolId: admin.school.id, schoolName: admin.school.name, boardId: admin.school.boardId };
  }
  const teacher = await db.teacher.findUnique({ where: { userId: session.id }, include: { school: true } });
  if (!teacher?.school) return null;
  return { schoolId: teacher.school.id, schoolName: teacher.school.name, boardId: teacher.school.boardId };
}

async function isSuperAdmin(db: OwnerDb, session: OwnerActor): Promise<boolean> {
  if (session.role !== "admin") return false;
  const admin = await db.admin.findUnique({ where: { userId: session.id }, select: { isSuperAdmin: true } });
  return admin?.isSuperAdmin === true;
}

/** True when this actor may publish / unpublish / index / delete a material owned by `materialSchoolId`. */
export async function actorMayManageMaterial(db: OwnerDb, session: OwnerActor, materialSchoolId: string | null): Promise<boolean> {
  if (materialSchoolId === null) return isSuperAdmin(db, session); // common: the platform's
  if (session.role === "admin") {
    const admin = await db.admin.findUnique({ where: { userId: session.id }, select: { isSuperAdmin: true, schoolId: true } });
    if (!admin) return false;
    return admin.isSuperAdmin || (admin.schoolId !== null && admin.schoolId === materialSchoolId);
  }
  const actorSchool = await resolveActorSchool(db, session);
  return actorSchool !== null && actorSchool.schoolId === materialSchoolId;
}

/**
 * Decides who a NEW material will belong to: common (super administrator only) or a school. Also refuses a board that
 * the owning school does not teach, since no student of that school could ever see such a material.
 */
export async function resolveMaterialTarget(
  db: OwnerDb,
  session: OwnerActor,
  input: { common?: boolean; schoolId?: string; boardId: string }
): Promise<{ ok: true; target: OwnerTarget } | { ok: false; error: string }> {
  if (input.common) {
    if (!(await isSuperAdmin(db, session))) return { ok: false, error: "Only the super administrator can create common materials." };
    return { ok: true, target: { schoolId: null, schoolName: "all schools (common)", boardId: null } };
  }
  const actorSchool = await resolveActorSchool(db, session, input.schoolId);
  if (!actorSchool) {
    return {
      ok: false,
      error: input.schoolId
        ? "That school doesn't exist or is disabled."
        : "Your account isn't associated with a school yet. Contact a super administrator before uploading materials.",
    };
  }
  // A school with a board only ever teaches that board. Schools that predate boards (none set) skip this check rather
  // than blocking uploads for an admin who has no way to fix it themselves.
  if (actorSchool.boardId && actorSchool.boardId !== input.boardId) {
    return { ok: false, error: "Selected board does not match your school's board." };
  }
  return { ok: true, target: actorSchool };
}
