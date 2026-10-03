"use server";

// Schools management for the platform super administrator: list with counts, create, edit and enable/disable.
// A school is a small record (name, optional state, optional board, enabled flag) that everything else hangs off
// - students, teachers, admins and study materials reference it - so this needs no schema change.
//
// This file only decides WHO may call (super administrator only: school admins cannot see or change schools);
// the rules themselves live in lib/schools/core.ts so they can be tested against the real database without
// persisting anything:
//   - a board must belong to the chosen state (national boards, which have no state, fit any state);
//   - a school's board can only be changed if none of its students or materials belong to a different board;
//   - disabling is SOFT: the school disappears from registration and the "set school" pickers and can no longer be
//     chosen as an upload target, but its existing students, staff and materials keep working. Nothing is deleted.
import { prisma } from "@/lib/prisma";
import { ForbiddenError, UnauthorizedError } from "@/lib/auth/current-session";
import { createSchoolCore, updateSchoolCore, setSchoolEnabledCore } from "@/lib/schools/core";
import { requireAdminActor } from "./user-management";
import type { ActionResult } from "./materials";

async function requireSuperAdmin() {
  const actor = await requireAdminActor();
  if (!actor.isSuperAdmin) throw new ForbiddenError("Only the super administrator can manage schools.");
  return actor;
}

export async function listSchoolsForAdmin() {
  await requireSuperAdmin();
  return prisma.school.findMany({
    orderBy: [{ isEnabled: "desc" }, { name: "asc" }],
    include: {
      state: { select: { id: true, name: true } },
      board: { select: { id: true, shortName: true } },
      _count: { select: { students: true, teachers: true, admins: true, studyMaterials: true } },
    },
  });
}

export async function createSchool(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const actor = await requireSuperAdmin();
    return await createSchoolCore(prisma, actor.userId, input);
  } catch (e) {
    if (e instanceof UnauthorizedError || e instanceof ForbiddenError) return { ok: false, error: e.message };
    throw e;
  }
}

export async function updateSchool(schoolId: string, input: unknown): Promise<ActionResult> {
  try {
    const actor = await requireSuperAdmin();
    return await updateSchoolCore(prisma, actor.userId, schoolId, input);
  } catch (e) {
    if (e instanceof UnauthorizedError || e instanceof ForbiddenError) return { ok: false, error: e.message };
    throw e;
  }
}

export async function setSchoolEnabled(schoolId: string, enabled: boolean): Promise<ActionResult> {
  try {
    const actor = await requireSuperAdmin();
    return await setSchoolEnabledCore(prisma, actor.userId, schoolId, enabled);
  } catch (e) {
    if (e instanceof UnauthorizedError || e instanceof ForbiddenError) return { ok: false, error: e.message };
    throw e;
  }
}
