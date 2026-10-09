// Which exact file a material is (its SHA-256), as needed to link passages to chapters. A normal-sized book is identified from its PDF
// through the cached, budgeted downloader - the hash comes from the downloader (computed at download time, before any consumer could touch the
// bytes), so it is never the hash of an emptied array. A book too big to read in one go is identified from the first usable window file its OCR
// run wrote (which records the hash of the PDF it read), so its 50+ MB PDF is never fetched for this.
import type { PdfFetch } from "@/lib/rag/pdf-cache";
import { OcrStorageUnavailableError } from "@/lib/rag/ocr-store-core";
import { StorageBlockedError } from "@/lib/storage/blocked";
import { DOWNLOAD_BUDGET_MESSAGE, DOWNLOAD_BUDGET_UNAVAILABLE_MESSAGE, OCR_STORAGE_UNAVAILABLE_MESSAGE, STORAGE_BLOCKED_MESSAGE } from "@/lib/storage/stop-messages";

export type SourceIdentity = { ok: true; sha: string } | { ok: false; message: string };

export interface SourceIdentityDeps {
  material: { id: string; sizeKb: number };
  maxDirectBytes: number;
  readOcrIdentity(): Promise<{ sourceSha256: string } | null>;
  getPdf(): Promise<PdfFetch>;
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
      if (got.reason === "budget_unavailable") return { ok: false, message: DOWNLOAD_BUDGET_UNAVAILABLE_MESSAGE };
      return { ok: false, message: got.reason === "too_big" ? "The stored file is too large to check." : "The stored file could not be downloaded." };
    }
    return { ok: true, sha: got.sha256 };
  } catch (e) {
    if (e instanceof StorageBlockedError) return { ok: false, message: STORAGE_BLOCKED_MESSAGE };
    if (e instanceof OcrStorageUnavailableError) return { ok: false, message: OCR_STORAGE_UNAVAILABLE_MESSAGE };
    throw e;
  }
}
