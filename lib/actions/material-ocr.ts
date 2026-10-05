"use server";

// Reads a textbook page by page with OCR when its PDF text layer cannot be used - a legacy font encoding that extracts as gibberish,
// a scanned book, or a file too big to read in one go. PDF -> render each page -> AI reader -> validate -> save the window's text.
// The text is saved window by window (lib/rag/ocr-store.ts), so a call that runs out of time or quota loses nothing and the next call
// carries on with the windows that are still missing; a window already read is never read again. When every page is read,
// "Continue indexing" builds the passages from that text exactly as it would from a PDF's own text layer. The PDF is never changed.
import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { UnauthorizedError, ForbiddenError } from "@/lib/auth/current-session";
import { loadManagedMaterial, requireManager } from "@/lib/materials/manager";
import { logAudit } from "@/lib/audit";
import { MAX_UPLOAD_BYTES } from "@/lib/storage/types";
import { MAX_DIRECT_READ_MB } from "@/lib/rag/limits";
import { assessTextLayer } from "@/lib/rag/text-quality";
import { formatIndexStatus } from "@/lib/rag/index-status";
import { expectedScriptForSubject, planWindows, validateOcrWindow, OCR_WINDOW_PAGES, type OcrWindowFile } from "@/lib/rag/ocr";
import { openPageRenderer } from "@/lib/rag/ocr-render";
import { ocrReaderConfigured, OcrReaderUnavailableError, readPages } from "@/lib/rag/ocr-reader";
import { savedWindowStarts, saveWindow } from "@/lib/rag/ocr-store";
import type { ActionResult } from "./materials";

// One call stays inside a 60 s function limit; windows are read a few at a time in parallel.
const CALL_BUDGET_MS = 52_000;
const PARALLEL_WINDOWS = 3;
/** Roughly how long one batch of windows takes; a new batch is only started when this much time is left. */
const BATCH_ALLOWANCE_MS = 28_000;

export interface OcrProgress {
  pagesDone: number;
  totalPages: number;
  complete: boolean;
  /** The AI reader refused for quota and nothing could be read this call: stop and come back later. */
  quotaExhausted: boolean;
  /** Windows that came back unusable this call (they stay unread and are retried next time). */
  failedWindows: number;
}

async function recordStatus(materialId: string, pagesDone: number, totalPages: number): Promise<void> {
  const status = pagesDone >= totalPages ? formatIndexStatus({ kind: "ocr_ready", total: totalPages }) : formatIndexStatus({ kind: "ocr_progress", done: pagesDone, total: totalPages });
  await prisma.studyMaterial.update({ where: { id: materialId }, data: { indexError: status, indexedAt: null } });
}

function pagesInWindows(starts: Set<number>, totalPages: number): number {
  let n = 0;
  for (const w of planWindows(totalPages)) if (starts.has(w.start)) n += w.end - w.start + 1;
  return n;
}

export async function ocrMaterial(materialId: string): Promise<ActionResult<OcrProgress>> {
  const startedAt = Date.now();
  try {
    const actor = await requireManager();
    const material = await loadManagedMaterial(actor, materialId);
    if (!material) return { ok: false, error: "Material not found." };
    if (!material.fileName.toLowerCase().endsWith(".pdf")) return { ok: false, error: "Only PDF files can be read this way." };
    if (!ocrReaderConfigured()) return { ok: false, error: "The AI reader is not set up, so pages cannot be read right now." };

    let bytes: Uint8Array;
    try {
      const res = await fetch(material.fileUrl);
      if (!res.ok) return { ok: false, error: "The stored file could not be downloaded." };
      if (Number(res.headers.get("content-length") ?? 0) > MAX_UPLOAD_BYTES) return { ok: false, error: "This file is larger than the upload limit." };
      bytes = new Uint8Array(await res.arrayBuffer());
    } catch {
      return { ok: false, error: "The stored file could not be downloaded." };
    }

    // Only a book that cannot be read directly is read with OCR - it costs AI calls, and the PDF's own text is better when it works.
    if (bytes.length <= MAX_DIRECT_READ_MB * 1024 * 1024) {
      try {
        const { extractText, getDocumentProxy } = await import("unpdf");
        const extracted = await extractText(await getDocumentProxy(new Uint8Array(bytes)), { mergePages: false });
        const pages = Array.isArray(extracted.text) ? extracted.text : [extracted.text];
        const hasText = pages.join("").replace(/\s+/g, "").length >= 200;
        if (hasText && assessTextLayer(pages).readable) return { ok: false, error: "This PDF already has readable text, so reading it page by page is not needed. Use Continue indexing." };
      } catch {
        /* the text layer could not even be opened: fall through to reading the pages */
      }
    }

    const sha = createHash("sha256").update(bytes).digest("hex");
    const subject = await prisma.subject.findUnique({ where: { id: material.subjectId }, select: { name: true } });
    const script = expectedScriptForSubject(subject?.name ?? "");

    let renderer;
    try {
      renderer = await openPageRenderer(bytes);
    } catch {
      return { ok: false, error: "This PDF could not be opened to read its pages." };
    }
    try {
      const totalPages = renderer.pageCount;
      const saved = await savedWindowStarts(material.id);
      const todo = planWindows(totalPages).filter((w) => !saved.has(w.start));
      let failedWindows = 0;
      let savedThisCall = 0;
      let quotaHit = false;
      let lastReason = "";

      for (let i = 0; i < todo.length && !quotaHit; i += PARALLEL_WINDOWS) {
        if (i > 0 && Date.now() + BATCH_ALLOWANCE_MS > startedAt + CALL_BUDGET_MS) break;
        const batch = todo.slice(i, i + PARALLEL_WINDOWS);
        // Render in turn (CPU-bound), read in parallel (network-bound).
        const rendered: { start: number; end: number; images: { page: number; png: Uint8Array }[] }[] = [];
        for (const w of batch) {
          const images: { page: number; png: Uint8Array }[] = [];
          for (let p = w.start; p <= w.end; p++) images.push({ page: p, png: await renderer.renderPng(p) });
          rendered.push({ ...w, images });
        }
        const outcomes = await Promise.allSettled(
          rendered.map(async (w) => {
            const { pages, model } = await readPages(w.images);
            const check = validateOcrWindow(pages, script);
            if (!check.ok) throw new Error(check.reason);
            const file: OcrWindowFile = { version: 1, totalPages, startPage: w.start, endPage: w.end, pages, sourceSha256: sha, model };
            await saveWindow(material.id, file);
          }),
        );
        for (const o of outcomes) {
          if (o.status === "fulfilled") savedThisCall++;
          else {
            failedWindows++;
            lastReason = o.reason instanceof Error ? o.reason.message : "A window could not be read.";
            if (o.reason instanceof OcrReaderUnavailableError && o.reason.quota) quotaHit = true;
          }
        }
        if (savedThisCall === 0 && failedWindows >= batch.length) break; // nothing worked: do not keep spending calls
      }

      const doneStarts = await savedWindowStarts(material.id);
      const pagesDone = pagesInWindows(doneStarts, totalPages);
      const complete = pagesDone >= totalPages;
      await recordStatus(material.id, pagesDone, totalPages);
      if (complete && savedThisCall > 0) {
        await logAudit(actor.session.id, "USER_UPDATE", `StudyMaterial:${material.id}`, `Read all ${totalPages} pages with OCR (window of ${OCR_WINDOW_PAGES} pages): "${material.title}"`);
      }
      if (savedThisCall === 0 && !complete && failedWindows > 0) {
        return { ok: false, error: quotaHit ? "The AI reader is out of quota right now. Everything read so far is saved - try again later." : `The pages could not be read this time (${lastReason}). Everything read so far is saved.` };
      }
      return { ok: true, data: { pagesDone, totalPages, complete, quotaExhausted: quotaHit && savedThisCall === 0, failedWindows } };
    } finally {
      renderer.close();
    }
  } catch (e) {
    if (e instanceof UnauthorizedError || e instanceof ForbiddenError) return { ok: false, error: e.message };
    throw e;
  }
}
