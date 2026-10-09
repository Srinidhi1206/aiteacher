"use server";

// Reads a textbook page by page with OCR when its PDF text layer cannot be used - a legacy font encoding that extracts as gibberish,
// a scanned book, or a file too big to read in one go. PDF -> render each page -> AI reader -> validate -> save the window's text.
// The text is saved window by window (lib/rag/ocr-store.ts), so a call that runs out of time or quota loses nothing and the next call
// carries on with the windows that are still missing; a window already read is never read again. When every page is read,
// "Continue indexing" builds the passages from that text exactly as it would from a PDF's own text layer. The PDF is never changed.
//
// The pass itself is lib/rag/ocr-run.ts: it looks at saved progress before it downloads anything, and it stops at once - without retrying -
// when file storage is blocked or the book's download budget is used up.
import { prisma } from "@/lib/prisma";
import { UnauthorizedError, ForbiddenError } from "@/lib/auth/current-session";
import { loadManagedMaterial, requireManager } from "@/lib/materials/manager";
import { logAudit } from "@/lib/audit";
import { MAX_UPLOAD_BYTES } from "@/lib/storage/types";
import { StorageBlockedError, assertStorageAvailable } from "@/lib/storage/blocked";
import { STORAGE_BLOCKED_MESSAGE } from "@/lib/storage/stop-messages";
import { MAX_DIRECT_READ_MB } from "@/lib/rag/limits";
import { assessTextLayer } from "@/lib/rag/text-quality";
import { formatIndexStatus, mayWriteOcrStatus, parseIndexStatus } from "@/lib/rag/index-status";
import { expectedScriptForSubject, validateOcrWindow, OCR_WINDOW_PAGES } from "@/lib/rag/ocr";
import { openPageRenderer } from "@/lib/rag/ocr-render";
import { ocrReaderConfigured, OcrReaderUnavailableError, readPages } from "@/lib/rag/ocr-reader";
import { savedPages, saveWindow, verifySaved } from "@/lib/rag/ocr-store";
import { extractPdfPages } from "@/lib/rag/pdf-text";
import { fetchPdfCached } from "@/lib/rag/pdf-cache";
import { runOcrPass, type OcrProgress } from "@/lib/rag/ocr-run";
import type { ActionResult } from "./materials";

export type { OcrProgress };

// One call stays inside a 60 s function limit; windows are read a few at a time in parallel.
const CALL_BUDGET_MS = 50_000;
const PARALLEL_WINDOWS = 3;
/** Roughly how long one batch of windows takes; a new batch is only started when this much time is left. */
const BATCH_ALLOWANCE_MS = 30_000;

async function textLayerUsable(bytes: Uint8Array): Promise<boolean> {
  try {
    const pages = await extractPdfPages(bytes); // pdf.js gets its own copy: the shared download is left intact
    return pages.join("").replace(/\s+/g, "").length >= 200 && assessTextLayer(pages).readable;
  } catch {
    return false; // the text layer could not even be opened: read the pages
  }
}

export async function ocrMaterial(materialId: string): Promise<ActionResult<OcrProgress>> {
  const startedAt = Date.now();
  try {
    const actor = await requireManager();
    const material = await loadManagedMaterial(actor, materialId);
    if (!material) return { ok: false, error: "Material not found." };
    if (!material.fileName.toLowerCase().endsWith(".pdf")) return { ok: false, error: "Only PDF files can be read this way." };
    if (!ocrReaderConfigured()) return { ok: false, error: "The AI reader is not set up, so pages cannot be read right now." };
    assertStorageAvailable(); // storage already known to be blocked on this instance: stop before doing anything

    const note = parseIndexStatus(material.indexError);
    const knownTotalPages = note?.kind === "ocr_progress" || note?.kind === "ocr_ready" ? note.total : null;
    const subject = await prisma.subject.findUnique({ where: { id: material.subjectId }, select: { name: true } });
    const script = expectedScriptForSubject(subject?.name ?? "");

    const result = await runOcrPass({
      knownTotalPages,
      getSavedPages: () => savedPages(material.id),
      verifySaved: () => verifySaved(material.id),
      saveWindow: (w) => saveWindow(material.id, w),
      getPdf: () => fetchPdfCached(material.fileUrl, MAX_UPLOAD_BYTES, { materialId: material.id, expectedBytes: material.sizeKb * 1024 }),
      maxDirectBytes: MAX_DIRECT_READ_MB * 1024 * 1024,
      textLayerUsable,
      openRenderer: openPageRenderer,
      readWindow: (images, firstModel) => readPages(images, startedAt + CALL_BUDGET_MS, firstModel),
      validate: (pages) => validateOcrWindow(pages, script),
      isQuotaFailure: (reason) => reason instanceof OcrReaderUnavailableError && reason.quota,
      recordStatus: async (pagesDone, totalPages) => {
        const status = pagesDone >= totalPages ? formatIndexStatus({ kind: "ocr_ready", total: totalPages }) : formatIndexStatus({ kind: "ocr_progress", done: pagesDone, total: totalPages });
        // Never over-write the record of a book that is being (or has been) indexed: that status carries passage progress only indexing owns.
        if (status !== material.indexError && mayWriteOcrStatus(material.indexError)) {
          await prisma.studyMaterial.update({ where: { id: material.id }, data: { indexError: status, indexedAt: null } });
        }
      },
      onComplete: (totalPages) => logAudit(actor.session.id, "USER_UPDATE", `StudyMaterial:${material.id}`, `Read all ${totalPages} pages with OCR (window of ${OCR_WINDOW_PAGES} pages): "${material.title}"`),
      now: Date.now,
      startedAt,
      callBudgetMs: CALL_BUDGET_MS,
      batchAllowanceMs: BATCH_ALLOWANCE_MS,
      parallelWindows: PARALLEL_WINDOWS,
    });
    return result;
  } catch (e) {
    if (e instanceof StorageBlockedError) return { ok: false, error: STORAGE_BLOCKED_MESSAGE };
    if (e instanceof UnauthorizedError || e instanceof ForbiddenError) return { ok: false, error: e.message };
    throw e;
  }
}
