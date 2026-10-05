"use server";

// Links an already-indexed material's passages to its chapters (no re-reading, no re-embedding). Only does anything for a file whose
// chapter pages were established and checked; says so plainly otherwise.
import { createHash } from "node:crypto";
import { UnauthorizedError, ForbiddenError } from "@/lib/auth/current-session";
import { loadManagedMaterial, requireManager } from "@/lib/materials/manager";
import { loadCompleteOcr } from "@/lib/rag/ocr-store";
import { planChapterLinks, linkSavedPassages } from "@/lib/rag/chapter-link";
import { logAudit } from "@/lib/audit";
import type { ActionResult } from "./materials";

export async function linkMaterialChapters(materialId: string): Promise<ActionResult<{ linked: number; mapped: boolean }>> {
  try {
    const actor = await requireManager();
    const material = await loadManagedMaterial(actor, materialId);
    if (!material) return { ok: false, error: "Material not found." };

    // The file's identity: the OCR run's recorded hash for an OCR-read book, otherwise the stored PDF's own hash.
    let sha: string | null = (await loadCompleteOcr(material.id))?.sourceSha256 ?? null;
    if (!sha) {
      try {
        const res = await fetch(material.fileUrl);
        if (!res.ok) return { ok: false, error: "The stored file could not be downloaded." };
        sha = createHash("sha256").update(new Uint8Array(await res.arrayBuffer())).digest("hex");
      } catch {
        return { ok: false, error: "The stored file could not be downloaded." };
      }
    }
    const plan = await planChapterLinks(material.subjectId, sha);
    if (!plan) return { ok: true, data: { linked: 0, mapped: false } };
    const linked = await linkSavedPassages(material.id, plan);
    if (linked > 0) await logAudit(actor.session.id, "USER_UPDATE", `StudyMaterial:${material.id}`, `Linked ${linked} passages to their chapters: "${material.title}"`);
    return { ok: true, data: { linked, mapped: true } };
  } catch (e) {
    if (e instanceof UnauthorizedError || e instanceof ForbiddenError) return { ok: false, error: e.message };
    throw e;
  }
}
