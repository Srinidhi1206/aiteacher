"use server";

// Makes a study material searchable for the AI Tutor: extract the PDF's text,
// split it into passages, embed each passage and store them (MaterialChunk).
// Who may do it: an admin of the material's own school (or a super admin), or
// the teacher who uploaded it - the same boundary as publish/delete. The
// material's school/class/subject/chapter/topic are copied onto every chunk so
// retrieval can never return a passage outside the student's own school+class.
//
// Limits (keeps one request bounded): PDFs only, at most MAX_PDF_MB, at most
// MAX_CHUNKS passages (the first ~hundred pages of a long book). A scanned
// PDF with no text layer can't be indexed and says so instead of pretending.
import { prisma } from "@/lib/prisma";
import { getCurrentSession, UnauthorizedError, ForbiddenError } from "@/lib/auth/current-session";
import { chunkText, embedTexts } from "@/lib/rag";
import type { ActionResult } from "./materials";

const MAX_PDF_MB = 40;
const MAX_CHUNKS = 400;

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

async function fail(materialId: string, message: string): Promise<ActionResult<{ chunks: number }>> {
  await prisma.studyMaterial.update({ where: { id: materialId }, data: { indexError: message, indexedAt: null } });
  return { ok: false, error: message };
}

export async function indexMaterial(materialId: string): Promise<ActionResult<{ chunks: number }>> {
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

    const passages: { page: number; text: string }[] = [];
    for (let i = 0; i < pages.length && passages.length < MAX_CHUNKS; i++) {
      for (const piece of chunkText(pages[i] ?? "")) {
        if (passages.length >= MAX_CHUNKS) break;
        passages.push({ page: i + 1, text: piece });
      }
    }
    if (passages.length === 0) {
      return fail(material.id, "No readable text was found in this PDF (it may be a scanned image), so the AI Tutor can't use it.");
    }

    let vectors: number[][];
    try {
      vectors = await embedTexts(passages.map((p) => p.text), "RETRIEVAL_DOCUMENT");
    } catch {
      return fail(material.id, "The AI service could not process this material right now. Try indexing again in a moment.");
    }

    await prisma.$transaction([
      prisma.materialChunk.deleteMany({ where: { materialId: material.id } }),
      prisma.materialChunk.createMany({
        data: passages.map((p, i) => ({
          materialId: material.id,
          schoolId: material.schoolId,
          schoolClassId: material.schoolClassId,
          subjectId: material.subjectId,
          chapterId: material.chapterId,
          topicId: material.topicId,
          chunkIndex: i,
          page: p.page,
          text: p.text,
          embedding: vectors[i],
        })),
      }),
      prisma.studyMaterial.update({ where: { id: material.id }, data: { indexedAt: new Date(), indexError: null } }),
    ]);
    return { ok: true, data: { chunks: passages.length } };
  } catch (e) {
    if (e instanceof UnauthorizedError || e instanceof ForbiddenError) return { ok: false, error: e.message };
    throw e;
  }
}
