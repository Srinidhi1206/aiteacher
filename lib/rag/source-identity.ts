// Which exact file a material is (its SHA-256), as needed to link passages to chapters. A normal-sized book is identified from its PDF
// through the cached, budgeted downloader - a second call within minutes costs no transfer. A book too big to read in one go is identified
// from the one small window file its OCR run wrote (which records the hash of the PDF it read), so its 50+ MB PDF is never fetched for this.
import type { PdfFetch } from "@/lib/rag/pdf-cache";
import { StorageBlockedError } from "@/lib/storage/blocked";
import { DOWNLOAD_BUDGET_MESSAGE, STORAGE_BLOCKED_MESSAGE } from "@/lib/storage/stop-messages";

export type SourceIdentity = { ok: true; sha: string } | { ok: false; message: string };

export interface SourceIdentityDeps {
  material: { id: string; sizeKb: number };
  maxDirectBytes: number;
  readOcrIdentity(): Promise<{ sourceSha256: string } | null>;
  getPdf(): Promise<PdfFetch>;
  sha256(bytes: Uint8Array): string;
}

export async function resolveSourceSha(deps: SourceIdentityDeps): Promise<SourceIdentity> {
  try {
    if (deps.material.sizeKb * 1024 > deps.maxDirectBytes) {
      const ocr = await deps.readOcrIdentity();
      return ocr ? { ok: true, sha: ocr.sourceSha256 } : { ok: false, message: "This book's pages have not been read yet (OCR), so its chapters cannot be linked yet." };
    }
    const got = await deps.getPdf();
    if (!got.ok) {
      if (got.reason === "blocked") return { ok: false, message: STORAGE_BLOCKED_MESSAGE };
      if (got.reason === "budget") return { ok: false, message: DOWNLOAD_BUDGET_MESSAGE };
      return { ok: false, message: got.reason === "too_big" ? "The stored file is too large to check." : "The stored file could not be downloaded." };
    }
    return { ok: true, sha: deps.sha256(got.bytes) };
  } catch (e) {
    if (e instanceof StorageBlockedError) return { ok: false, message: STORAGE_BLOCKED_MESSAGE };
    throw e;
  }
}
