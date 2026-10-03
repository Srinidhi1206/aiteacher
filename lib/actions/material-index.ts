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
// text layer can't be indexed and says so instead of pretending.
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
import { prisma } from "@/lib/prisma";
import { getCurrentSession, UnauthorizedError, ForbiddenError } from "@/lib/auth/current-session";
import { chunkText, embedTexts, describeEmbeddingError, EMBED_PER_MINUTE, INDEX_BATCH_SIZE } from "@/lib/rag";
import { formatIndexStatus } from "@/lib/rag/index-status";
import { logAudit } from "@/lib/audit";
import type { ActionResult } from "./materials";

const MAX_PDF_MB = 40;
const MAX_PASSAGES = 2500;
// One call stays well inside a 60 s function limit.
const CALL_BUDGET_MS = 48_000;
const BATCH_MARGIN_MS = 6_000;

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
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function requireManager() {
  const session = await getCurrentSession();
  if (!session) throw new UnauthorizedError();
  if (session.role === "admin") {
    const admin = await prisma.admin.findUnique({ where: { userId: session.id }, select: { isSuperAdmin: true, schoolId: true } });
    if (!admin) throw new ForbiddenError("Admin profile not found.");
    return { session, isSuperAdmin: admin.isSuperAdmin, schoolId: admin.schoolId };
  }
  if (session.role === "teacher") {
    const teacher = await prisma.teacher.findUnique({ where: { userId: session.id }, select: { schoolId: true } });
    if (!teacher) throw new ForbiddenError("Teacher profile not found.");
    return { session, isSuperAdmin: false, schoolId: teacher.schoolId };
  }
  throw new ForbiddenError("Only admins and teachers can index study materials.");
}

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
    const material = await prisma.studyMaterial.findUnique({ where: { id: materialId } });
    // A material from another school answers exactly like a missing one.
    const allowed =
      material &&
      (actor.isSuperAdmin || (actor.schoolId !== null && material.schoolId === actor.schoolId)) &&
      (actor.session.role === "admin" || material.uploadedByUserId === actor.session.id);
    if (!material || !allowed) return { ok: false, error: "Material not found." };

    if (!material.fileName.toLowerCase().endsWith(".pdf")) {
      return fail(material.id, "Only PDF files can be used by the AI Tutor for now.");
    }

    let bytes: Uint8Array;
    try {
      const res = await fetch(material.fileUrl);
      if (!res.ok) return fail(material.id, "The stored file could not be downloaded.");
      const length = Number(res.headers.get("content-length") ?? 0);
      if (length > MAX_PDF_MB * 1024 * 1024) return fail(material.id, `This PDF is larger than ${MAX_PDF_MB} MB, which is too large to index.`);
      bytes = new Uint8Array(await res.arrayBuffer());
      if (bytes.length > MAX_PDF_MB * 1024 * 1024) return fail(material.id, `This PDF is larger than ${MAX_PDF_MB} MB, which is too large to index.`);
    } catch {
      return fail(material.id, "The stored file could not be downloaded.");
    }

    let pages: string[];
    try {
      const { extractText, getDocumentProxy } = await import("unpdf");
      const pdf = await getDocumentProxy(bytes);
      const extracted = await extractText(pdf, { mergePages: false });
      pages = extracted.text;
    } catch {
      return fail(material.id, "This PDF could not be read.");
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
      return fail(material.id, "No readable text was found in this PDF (it may be a scanned image), so the AI Tutor can't use it.");
    }

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

    let embeddedThisCall = 0;
    let firstEmbedAt: number | null = null;
    let waitMs = 0;

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
        // Rate limit: wait as long as the provider asked and retry the same slice if it fits in this
        // call; otherwise hand the wait to the caller.
        const retryMs = (info.retryAfterMs ?? 60_000) + 1_000;
        if (Date.now() + retryMs + BATCH_MARGIN_MS <= callStartedAt + CALL_BUDGET_MS) {
          await sleep(retryMs);
          continue;
        }
        waitMs = retryMs;
        break;
      }

      // Another run on the same material would make the saved prefix stop matching `done`.
      if ((await prisma.materialChunk.count({ where: { materialId: material.id } })) !== done) {
        return { ok: false, error: "This material is already being indexed. Wait a minute and try again." };
      }
      await prisma.materialChunk.createMany({
        data: slice.map((p, j) => ({
          materialId: material.id,
          schoolId: material.schoolId,
          schoolClassId: material.schoolClassId,
          subjectId: material.subjectId,
          chapterId: material.chapterId,
          topicId: material.topicId,
          chunkIndex: done + j,
          page: p.page,
          text: p.text,
          embedding: vectors[j],
        })),
      });
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
    return { ok: true, data: { chunks: done, total, available, complete: false, waitMs } };
  } catch (e) {
    if (e instanceof UnauthorizedError || e instanceof ForbiddenError) return { ok: false, error: e.message };
    throw e;
  }
}
