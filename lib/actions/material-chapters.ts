"use server";

// Links an already-indexed material's passages to its chapters (no re-reading, no re-embedding). Only does anything for a file whose
// chapter pages were established and checked; says so plainly otherwise. Finding out WHICH file a material is goes through
// lib/rag/source-identity.ts, so it never fetches the same PDF twice in a row and never fetches a very large one at all.
import { createHash } from "node:crypto";
import { UnauthorizedError, ForbiddenError } from "@/lib/auth/current-session";
import { loadManagedMaterial, requireManager } from "@/lib/materials/manager";
import { readOcrIdentity } from "@/lib/rag/ocr-store";
import { fetchPdfCached } from "@/lib/rag/pdf-cache";
import { resolveSourceSha } from "@/lib/rag/source-identity";
import { MAX_DIRECT_READ_MB } from "@/lib/rag/limits";
import { MAX_UPLOAD_BYTES } from "@/lib/storage/types";
import { StorageBlockedError, assertStorageAvailable } from "@/lib/storage/blocked";
import { STORAGE_BLOCKED_MESSAGE } from "@/lib/storage/stop-messages";
import { planChapterLinks, linkSavedPassages } from "@/lib/rag/chapter-link";
import { logAudit } from "@/lib/audit";
import type { ActionResult } from "./materials";

export async function linkMaterialChapters(materialId: string): Promise<ActionResult<{ linked: number; mapped: boolean }>> {
  try {
    const actor = await requireManager();
    const material = await loadManagedMaterial(actor, materialId);
    if (!material) return { ok: false, error: "Material not found." };
    assertStorageAvailable();

    const identity = await resolveSourceSha({
      material: { id: material.id, sizeKb: material.sizeKb },
      maxDirectBytes: MAX_DIRECT_READ_MB * 1024 * 1024,
      readOcrIdentity: () => readOcrIdentity(material.id),
      getPdf: () => fetchPdfCached(material.fileUrl, MAX_UPLOAD_BYTES, { materialId: material.id }),
      sha256: (bytes) => createHash("sha256").update(bytes).digest("hex"),
    });
    if (!identity.ok) return { ok: false, error: identity.message };

    const plan = await planChapterLinks(material.subjectId, identity.sha);
    if (!plan) return { ok: true, data: { linked: 0, mapped: false } };
    const linked = await linkSavedPassages(material.id, plan);
    if (linked > 0) await logAudit(actor.session.id, "USER_UPDATE", `StudyMaterial:${material.id}`, `Linked ${linked} passages to their chapters: "${material.title}"`);
    return { ok: true, data: { linked, mapped: true } };
  } catch (e) {
    if (e instanceof StorageBlockedError) return { ok: false, error: STORAGE_BLOCKED_MESSAGE };
    if (e instanceof UnauthorizedError || e instanceof ForbiddenError) return { ok: false, error: e.message };
    throw e;
  }
}
