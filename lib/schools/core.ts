// Core logic for school management, kept apart from the server actions (lib/actions/school-admin.ts) so it takes
// the database handle as a parameter. The actions pass the real client after checking that the caller is the
// super administrator; tests pass a transaction they roll back, so the real rules can be exercised against the
// real database without leaving anything behind. Nothing here checks WHO is calling - that is the action's job.
import { z } from "zod";
import type { prisma } from "@/lib/prisma";

export type SchoolDb = Pick<typeof prisma, "school" | "state" | "board" | "student" | "studyMaterial" | "auditLog">;
export type CoreResult<T = void> = { ok: boolean; error?: string; data?: T };

export const schoolInputSchema = z.object({
  name: z.string().trim().min(2, "School name is required").max(150),
  stateId: z.string().trim().optional(),
  boardId: z.string().trim().optional(),
});

type Placement = { stateId: string | null; boardId: string | null };

/** Resolves and cross-checks the optional state and board. A board that belongs to a state also fills in the state. */
async function resolvePlacement(db: SchoolDb, input: { stateId?: string; boardId?: string }): Promise<{ ok: true; value: Placement } | { ok: false; error: string }> {
  let stateId = input.stateId || null;
  const boardId = input.boardId || null;
  if (stateId) {
    const state = await db.state.findUnique({ where: { id: stateId } });
    if (!state) return { ok: false, error: "State not found." };
  }
  if (boardId) {
    const board = await db.board.findUnique({ where: { id: boardId } });
    if (!board) return { ok: false, error: "Board not found." };
    if (board.stateId && stateId && board.stateId !== stateId) return { ok: false, error: "That board does not belong to the selected state." };
    if (board.stateId && !stateId) stateId = board.stateId;
  }
  return { ok: true, value: { stateId, boardId } };
}

export async function createSchoolCore(db: SchoolDb, actorUserId: string, input: unknown): Promise<CoreResult<{ id: string }>> {
  const parsed = schoolInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  const placement = await resolvePlacement(db, parsed.data);
  if (!placement.ok) return placement;

  const duplicate = await db.school.findFirst({
    where: { name: { equals: parsed.data.name, mode: "insensitive" }, stateId: placement.value.stateId, boardId: placement.value.boardId },
  });
  if (duplicate) return { ok: false, error: "A school with this name, state and board already exists." };

  const school = await db.school.create({ data: { name: parsed.data.name, ...placement.value, isEnabled: true } });
  await db.auditLog.create({
    data: { userId: actorUserId, action: "USER_UPDATE", resource: `School:${school.id}`, message: `School created: "${school.name}"` },
  });
  return { ok: true, data: { id: school.id } };
}

export async function updateSchoolCore(db: SchoolDb, actorUserId: string, schoolId: string, input: unknown): Promise<CoreResult> {
  const parsed = schoolInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  const school = await db.school.findUnique({ where: { id: schoolId } });
  if (!school) return { ok: false, error: "School not found." };
  const placement = await resolvePlacement(db, parsed.data);
  if (!placement.ok) return placement;

  const duplicate = await db.school.findFirst({
    where: { id: { not: schoolId }, name: { equals: parsed.data.name, mode: "insensitive" }, stateId: placement.value.stateId, boardId: placement.value.boardId },
  });
  if (duplicate) return { ok: false, error: "Another school with this name, state and board already exists." };

  // Moving a school to a different board must not strand the students or materials already in it.
  const newBoardId = placement.value.boardId;
  if (newBoardId && newBoardId !== school.boardId) {
    const [students, materials] = await Promise.all([
      db.student.count({ where: { schoolId, boardId: { not: null, notIn: [newBoardId] } } }),
      db.studyMaterial.count({ where: { schoolId, boardId: { not: newBoardId } } }),
    ]);
    if (students > 0 || materials > 0) {
      return {
        ok: false,
        error: `This school has ${students} student(s) and ${materials} material(s) on a different board, so its board cannot be changed. Move or remove them first.`,
      };
    }
  }

  await db.school.update({ where: { id: schoolId }, data: { name: parsed.data.name, ...placement.value } });
  await db.auditLog.create({
    data: { userId: actorUserId, action: "USER_UPDATE", resource: `School:${schoolId}`, message: `School updated: "${school.name}" -> "${parsed.data.name}"` },
  });
  return { ok: true };
}

export async function setSchoolEnabledCore(db: SchoolDb, actorUserId: string, schoolId: string, enabled: boolean): Promise<CoreResult> {
  const school = await db.school.findUnique({ where: { id: schoolId } });
  if (!school) return { ok: false, error: "School not found." };
  if (school.isEnabled === enabled) return { ok: true };
  await db.school.update({ where: { id: schoolId }, data: { isEnabled: enabled } });
  await db.auditLog.create({
    data: { userId: actorUserId, action: "USER_UPDATE", resource: `School:${schoolId}`, message: `School ${enabled ? "enabled" : "disabled"}: "${school.name}"` },
  });
  return { ok: true };
}
