// Moving an existing study material between "private to one school" and "common to every school", without uploading
// or re-indexing anything. A common material has schoolId NULL (see lib/materials/owner.ts); its board and class stay,
// so it still only ever reaches students of that board + class. The material row and its MaterialChunk rows (which
// copy the school so retrieval can filter on it) change together in one transaction - the indexed passages and their
// embeddings are never touched. Takes the database handle as a parameter so it can be tested against a real database.
// Who may do this (the super administrator only) is checked by the caller, lib/actions/materials.ts.
import type { prisma } from "@/lib/prisma";

export type ShareDb = Pick<typeof prisma, "studyMaterial" | "materialChunk" | "school" | "$transaction">;
export type MaterialScopeTarget = { common: true } | { common?: false; schoolId: string };

export type ScopeChangeResult =
  | { ok: true; title: string; from: string | null; to: string | null; passages: number }
  | { ok: false; error: string };

export async function changeMaterialScopeCore(db: ShareDb, materialId: string, target: MaterialScopeTarget): Promise<ScopeChangeResult> {
  const material = await db.studyMaterial.findUnique({
    where: { id: materialId },
    select: { id: true, title: true, schoolId: true, boardId: true },
  });
  if (!material) return { ok: false, error: "Material not found." };

  let newSchoolId: string | null;
  if (target.common) {
    if (material.schoolId === null) return { ok: false, error: "This material is already shared with every school." };
    newSchoolId = null;
  } else {
    const school = await db.school.findUnique({ where: { id: target.schoolId }, select: { id: true, isEnabled: true, boardId: true } });
    if (!school || !school.isEnabled) return { ok: false, error: "That school doesn't exist or is disabled." };
    // A school with a board only teaches that board - no student there could ever see a material of another board.
    if (school.boardId && school.boardId !== material.boardId) return { ok: false, error: "That school's board does not match this material's board." };
    if (material.schoolId === school.id) return { ok: false, error: "This material already belongs to that school." };
    newSchoolId = school.id;
  }

  const passages = await db.$transaction(async (tx) => {
    await tx.studyMaterial.update({ where: { id: material.id }, data: { schoolId: newSchoolId } });
    const moved = await tx.materialChunk.updateMany({ where: { materialId: material.id }, data: { schoolId: newSchoolId } });
    return moved.count;
  });
  return { ok: true, title: material.title, from: material.schoolId, to: newSchoolId, passages };
}
