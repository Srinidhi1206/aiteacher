"use server";

// Makes a study material searchable for the AI Tutor: extract the PDF's text,
// split it into passages, embed each passage and store them (MaterialChunk).
// Who may do it: an admin of the material's own school (or a super admin), or
// the teacher who uploaded it - the same boundary as publish/delete. The
// material's school/class/subject/chapter/topic are copied onto every chunk so
// retrieval can never return a passage outside the student's own school+class.
//
// Limits (keeps one request bounded): PDFs only, at most MAX_PDF_MB, at most
// MAX_PASSAGES passages per material - a safety ceiling well above a full textbook, never a
// silent cut: if a book is ever longer, the status says "first N of M". A scanned PDF with no
// text layer, or one whose text layer is a legacy font encoding (gibberish), can't be indexed and says so
// instead of pretending.
//
// Pacing and resuming: the embedding provider caps how many passages it will process per
// minute (see EMBED_PER_MINUTE in lib/rag), so a book takes several minutes. Each call embeds
// as many passages as fit in one request, saves them as it goes, and returns how many are
// done. The next call resumes from the passages already saved - a contiguous prefix, because
// chunking is deterministic - and never re-embeds them. The admin screen repeats the call
// until `complete`, so it is one click; if it is interrupted, clicking again continues.
// Saved passages are checked against the freshly chunked file before resuming; if they no
// longer fit it (a different file, or text extraction changed) they are replaced rather than
// left orphaned. `rebuild` is the only way to throw away a good prefix.
import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { UnauthorizedError, ForbiddenError } from "@/lib/auth/current-session";
import { loadManagedMaterial, requireManager } from "@/lib/materials/manager";
import { chunkText, embedTexts, describeEmbeddingError, EMBED_PER_MINUTE, INDEX_BATCH_SIZE } from "@/lib/rag";
import { formatIndexStatus } from "@/lib/rag/index-status";
import { assessTextLayer, UNREADABLE_TEXT_MESSAGE } from "@/lib/rag/text-quality";
import { MAX_DIRECT_READ_MB } from "@/lib/rag/limits";
import { loadCompleteOcr } from "@/lib/rag/ocr-store";
import { saveChunksAtomically } from "@/lib/rag/save-chunks";
import { CHAPTER_PAGE_MAPS, chapterSlugForPage } from "@/lib/curriculum-import-data/chapter-page-maps";
import { logAudit } from "@/lib/audit";
import type { ActionResult } from "./materials";

const MAX_PDF_MB = MAX_DIRECT_READ_MB;
const MAX_PASSAGES = 2500;
// One call stays well inside a 60 s function limit.
const CALL_BUDGET_MS = 48_000;
const BATCH_MARGIN_MS = 6_000;
/** A provider wait longer than this is a daily limit, not a per-minute one: stop and let the admin come back later. */
const LONG_WAIT_MS = 5 * 60_000;

export interface IndexProgress {
  /** Passages saved so far. */
  chunks: number;
  /** Passages this material will have once indexed (never more than MAX_PASSAGES). */
  total: number;
  /** Passages the PDF actually produces; larger than `total` only when the ceiling cut it. */
  available: number;
  complete: boolean;
  /** How long to wait before calling again when not complete. */
  waitMs: number;
  /** The embedding provider's daily (or repeated) limit was hit with nothing saved this call: progress is kept, come back later. */
  quotaExhausted?: boolean;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fail(materialId: string, message: string): Promise<ActionResult<IndexProgress>> {
  await prisma.studyMaterial.update({ where: { id: materialId }, data: { indexError: message, indexedAt: null } });
  return { ok: false, error: message };
}

/**
 * True when the saved passages (`count` of them) are a clean prefix of this file's passages:
 * indexes 0..count-1 with no gaps or repeats, and the texts at the start and at the end of the part
 * that overlaps the file match. Checking the ends is enough in practice - chunking is deterministic,
 * so a different file or different extraction differs at the start or by the end - and it keeps this
 * to two small reads. If more passages are saved than the file now yields, only the overlap is compared.
 */
async function savedPrefixMatches(materialId: string, count: number, passages: { text: string }[]): Promise<boolean> {
  if (count === 0) return true;
  const rows = await prisma.materialChunk.findMany({ where: { materialId }, select: { chunkIndex: true }, orderBy: { chunkIndex: "asc" } });
  if (!rows.every((r, i) => r.chunkIndex === i)) return false;
  const last = Math.min(count, passages.length) - 1;
  const wanted = [...new Set([0, last])];
  const ends = await prisma.materialChunk.findMany({ where: { materialId, chunkIndex: { in: wanted } }, select: { chunkIndex: true, text: true } });
  return ends.length === wanted.length && ends.every((e) => passages[e.chunkIndex]?.text === e.text);
}

export async function indexMaterial(materialId: string, options?: { rebuild?: boolean }): Promise<ActionResult<IndexProgress>> {
  const callStartedAt = Date.now();
  try {
    const actor = await requireManager();
    // A material from another school answers exactly like a missing one.
    const material = await loadManagedMaterial(actor, materialId);
    if (!material) return { ok: false, error: "Material not found." };

    if (!material.fileName.toLowerCase().endsWith(".pdf")) {
      return fail(material.id, "Only PDF files can be used by the AI Tutor for now.");
    }

    // Where the text comes from. A finished OCR run (lib/actions/material-ocr.ts) replaces the PDF's own text layer - it is the only
    // readable text such a book has - and then the PDF is not even downloaded. Otherwise the PDF's text layer is read directly.
    let pages: string[];
    let sourceSha: string | null;
    const ocr = await loadCompleteOcr(material.id);
    if (ocr) {
      pages = ocr.pages;
      sourceSha = ocr.sourceSha256;
    } else {
      let bytes: Uint8Array;
      try {
        const res = await fetch(material.fileUrl);
        if (!res.ok) return fail(material.id, "The stored file could not be downloaded.");
        const tooBig = `This PDF is larger than ${MAX_PDF_MB} MB, so it cannot be read in one go. It is read page by page (OCR) instead.`;
        const length = Number(res.headers.get("content-length") ?? 0);
        if (length > MAX_PDF_MB * 1024 * 1024) return fail(material.id, tooBig);
        bytes = new Uint8Array(await res.arrayBuffer());
        if (bytes.length > MAX_PDF_MB * 1024 * 1024) return fail(material.id, tooBig);
      } catch {
        return fail(material.id, "The stored file could not be downloaded.");
      }
      sourceSha = createHash("sha256").update(bytes).digest("hex");
      try {
        const { extractText, getDocumentProxy } = await import("unpdf");
        const pdf = await getDocumentProxy(bytes);
        const extracted = await extractText(pdf, { mergePages: false });
        pages = extracted.text;
      } catch {
        return fail(material.id, "This PDF could not be read.");
      }
      // A legacy-font text layer extracts as symbols, not words: refuse it rather than index gibberish.
      if (!assessTextLayer(pages).readable) return fail(material.id, UNREADABLE_TEXT_MESSAGE);
    }

    // Count every passage the PDF produces, but only keep up to the ceiling to embed.
    const passages: { page: number; text: string }[] = [];
    let available = 0;
    for (let i = 0; i < pages.length; i++) {
      for (const piece of chunkText(pages[i] ?? "")) {
        available++;
        if (passages.length < MAX_PASSAGES) passages.push({ page: i + 1, text: piece });
      }
    }
    if (passages.length === 0) {
      return fail(material.id, "No readable text was found in this PDF (it may be a scanned image), so the AI Tutor can't use it. It can be read page by page (OCR) instead.");
    }

    // Chapter links: only for a file whose chapter pages were established and checked (chapter-page-maps.ts, keyed by the file's
    // hash) AND whose subject really has all those chapters. Anything else leaves passages whole-subject rather than guess.
    const pageMap = sourceSha ? CHAPTER_PAGE_MAPS[sourceSha] : undefined;
    const chapterIdBySlug = new Map<string, string>();
    if (pageMap) {
      const rows = await prisma.chapter.findMany({ where: { subjectId: material.subjectId, slug: { in: pageMap.ranges.map((r) => r.slug) } }, select: { id: true, slug: true } });
      if (rows.length === pageMap.ranges.length) for (const r of rows) chapterIdBySlug.set(r.slug, r.id);
    }
    const linking = chapterIdBySlug.size > 0;
    const chapterIdForPage = (page: number): string | null => {
      const slug = linking ? chapterSlugForPage(pageMap, page) : null;
      return (slug && chapterIdBySlug.get(slug)) || material.chapterId;
    };

    const total = passages.length;
    const truncated = available > total;

    // Where to resume. A good saved prefix is kept and never re-embedded - even for a material that
    // was marked indexed under the old 400-passage cap, which is exactly how the rest of a long book
    // gets added. Saved passages that don't fit this file are replaced; extras beyond the file's
    // passage count (the file now yields fewer) are trimmed.
    const saved = await prisma.materialChunk.count({ where: { materialId: material.id } });
    let done = 0;
    if (saved > 0) {
      const fits = !options?.rebuild && (await savedPrefixMatches(material.id, saved, passages));
      if (!fits) {
        await prisma.materialChunk.deleteMany({ where: { materialId: material.id } });
      } else if (saved > total) {
        await prisma.materialChunk.deleteMany({ where: { materialId: material.id, chunkIndex: { gte: total } } });
        done = total;
      } else {
        done = saved;
      }
    }
    // A saved prefix that doesn't reach the end is an unfinished material, not a finished one.
    if (done < total && material.indexedAt) {
      await prisma.studyMaterial.update({ where: { id: material.id }, data: { indexedAt: null } });
    }

    // Passages saved earlier (before the links existed, or by an interrupted run) get their chapter now; harmless to repeat.
    if (linking && pageMap) {
      for (const r of pageMap.ranges) {
        const chapterId = chapterIdBySlug.get(r.slug) as string;
        await prisma.materialChunk.updateMany({
          where: { materialId: material.id, page: { gte: r.start, lte: r.end }, OR: [{ chapterId: null }, { chapterId: { not: chapterId } }] },
          data: { chapterId },
        });
      }
    }

    let embeddedThisCall = 0;
    let firstEmbedAt: number | null = null;
    let waitMs = 0;
    let quotaHits = 0;
    let quotaExhausted = false;

    while (done < total && embeddedThisCall < EMBED_PER_MINUTE) {
      if (Date.now() + BATCH_MARGIN_MS > callStartedAt + CALL_BUDGET_MS) break;
      const slice = passages.slice(done, done + Math.min(INDEX_BATCH_SIZE, EMBED_PER_MINUTE - embeddedThisCall));
      firstEmbedAt ??= Date.now();

      let vectors: number[][];
      try {
        vectors = await embedTexts(slice.map((p) => p.text), "RETRIEVAL_DOCUMENT");
      } catch (err) {
        // Safe metadata only: never the raw provider response, never a key.
        const info = describeEmbeddingError(err);
        console.error(`[index] embedding failed material=${material.id} status=${info.status ?? "none"} category=${info.category} done=${done}/${total} batch=${slice.length}`);
        if (info.category !== "quota") {
          return fail(material.id, "The AI service could not process this material right now. Try indexing again in a moment.");
        }
        // Rate limit: wait as long as the provider asked and retry the same slice if it fits in this call; otherwise hand the
        // wait to the caller. A long wait, or the same refusal again straight after waiting, is a daily limit: say so and stop.
        quotaHits++;
        const retryMs = (info.retryAfterMs ?? 60_000) + 1_000;
        if (retryMs > LONG_WAIT_MS || (quotaHits >= 2 && embeddedThisCall === 0)) {
          waitMs = retryMs;
          quotaExhausted = embeddedThisCall === 0;
          break;
        }
        if (Date.now() + retryMs + BATCH_MARGIN_MS <= callStartedAt + CALL_BUDGET_MS) {
          await sleep(retryMs);
          continue;
        }
        waitMs = retryMs;
        break;
      }

      // The saved count is re-checked and the rows inserted in one locked transaction, so a second run on the same material (another
      // tab, a double click) can never insert the same passages twice.
      const saveResult = await saveChunksAtomically(
        material.id,
        done,
        slice.map((p, j) => ({
          materialId: material.id,
          schoolId: material.schoolId,
          schoolClassId: material.schoolClassId,
          subjectId: material.subjectId,
          chapterId: chapterIdForPage(p.page),
          topicId: material.topicId,
          chunkIndex: done + j,
          page: p.page,
          text: p.text,
          embedding: vectors[j],
        })),
      );
      if (saveResult !== "ok") return { ok: false, error: "This material is already being indexed. Wait a minute and try again." };
      done += slice.length;
      embeddedThisCall += slice.length;
    }

    if (done >= total) {
      await prisma.studyMaterial.update({
        where: { id: material.id },
        data: {
          indexedAt: new Date(),
          indexError: formatIndexStatus(truncated ? { kind: "truncated", done: total, available } : { kind: "complete", total }),
        },
      });
      await logAudit(actor.session.id, "USER_UPDATE", `StudyMaterial:${material.id}`, `Material indexed for the AI Tutor: "${material.title}" (${total} passages${truncated ? `, first ${total} of ${available}` : ""})`);
      return { ok: true, data: { chunks: total, total, available, complete: true, waitMs: 0 } };
    }

    // Not finished: tell the caller when the provider's per-minute window will have reopened.
    if (waitMs === 0 && firstEmbedAt !== null) waitMs = Math.max(0, 61_000 - (Date.now() - firstEmbedAt));
    await prisma.studyMaterial.update({
      where: { id: material.id },
      data: { indexError: formatIndexStatus({ kind: "in_progress", done, total }) },
    });
    return { ok: true, data: { chunks: done, total, available, complete: false, waitMs, quotaExhausted } };
  } catch (e) {
    if (e instanceof UnauthorizedError || e instanceof ForbiddenError) return { ok: false, error: e.message };
    throw e;
  }
}
