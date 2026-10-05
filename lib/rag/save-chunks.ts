// Saving a batch of passages so that "Continue indexing" is safe to trigger twice at once: the check that the material still has
// exactly the expected number of passages and the insert happen in ONE transaction that holds a per-material advisory lock, so two
// concurrent calls can never both insert the same passages. The loser gets "busy" / "conflict" and simply reports it.
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type SaveResult = "ok" | "busy" | "conflict";

export async function saveChunksAtomically(materialId: string, expectedSaved: number, rows: Prisma.MaterialChunkCreateManyInput[]): Promise<SaveResult> {
  return prisma.$transaction(
    async (tx) => {
      const [{ locked }] = await tx.$queryRaw<{ locked: boolean }[]>`SELECT pg_try_advisory_xact_lock(hashtextextended(${materialId}, 0)) AS locked`;
      if (!locked) return "busy" as const;
      const saved = await tx.materialChunk.count({ where: { materialId } });
      if (saved !== expectedSaved) return "conflict" as const;
      await tx.materialChunk.createMany({ data: rows });
      return "ok" as const;
    },
    { timeout: 20_000 },
  );
}
