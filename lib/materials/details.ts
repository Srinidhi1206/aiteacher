// Editing an existing study material's descriptive details without re-uploading or re-indexing it: its title and
// description, and where it sits in the book - one chapter / topic, or the WHOLE SUBJECT (no chapter), which is the right
// home for a complete textbook. Board, class, subject and school are not editable here (the school/common switch is
// lib/materials/share.ts; moving a file to another class or subject is a new upload). The material row and its indexed
// MaterialChunk rows (which copy chapter and topic so retrieval can filter on them) change together in one transaction;
// the passages and their embeddings are never touched. Takes the database handle as a parameter so it can be tested
// against a real database. Who may do this is checked by the caller, lib/actions/materials.ts.
import type { prisma } from "@/lib/prisma";

export type DetailsDb = Pick<typeof prisma, "studyMaterial" | "materialChunk" | "chapter" | "topic" | "$transaction">;

export interface MaterialDetailsInput {
  title?: string;
  description?: string | null;
  /** undefined = leave as is; null = whole subject (no chapter); an id = that chapter (must belong to the material's subject). */
  chapterId?: string | null;
  /** undefined = leave as is (cleared automatically when the chapter changes); null = no topic; an id = that topic (must belong to the chapter). */
  topicId?: string | null;
}

export type DetailsResult = { ok: true; title: string; changes: string[]; passages: number } | { ok: false; error: string };

export async function updateMaterialDetailsCore(db: DetailsDb, materialId: string, input: MaterialDetailsInput): Promise<DetailsResult> {
  const material = await db.studyMaterial.findUnique({
    where: { id: materialId },
    select: { id: true, title: true, description: true, subjectId: true, chapterId: true, topicId: true, chapter: { select: { name: true } } },
  });
  if (!material) return { ok: false, error: "Material not found." };

  const data: { title?: string; description?: string | null; chapterId?: string | null; topicId?: string | null } = {};
  const changes: string[] = [];

  if (input.title !== undefined) {
    const title = input.title.trim();
    if (title.length < 1 || title.length > 200) return { ok: false, error: "The title must be between 1 and 200 characters." };
    if (title !== material.title) {
      data.title = title;
      changes.push(`title "${material.title}" -> "${title}"`);
    }
  }
  if (input.description !== undefined) {
    const description = input.description === null ? null : input.description.trim() || null;
    if (description !== null && description.length > 2000) return { ok: false, error: "The description is too long (2000 characters at most)." };
    if (description !== material.description) {
      data.description = description;
      changes.push("description changed");
    }
  }

  // Where it sits. A chapter change drops the old topic unless a topic of the new chapter is named.
  if (input.chapterId !== undefined || input.topicId !== undefined) {
    const newChapterId = input.chapterId === undefined ? material.chapterId : input.chapterId;
    let newTopicId = input.topicId === undefined ? (input.chapterId !== undefined && input.chapterId !== material.chapterId ? null : material.topicId) : input.topicId;
    let newChapterName = "whole subject";
    if (newChapterId) {
      const chapter = await db.chapter.findUnique({ where: { id: newChapterId }, select: { name: true, subjectId: true } });
      if (!chapter || chapter.subjectId !== material.subjectId) return { ok: false, error: "That chapter does not belong to this material's subject." };
      newChapterName = chapter.name;
    } else {
      newTopicId = null; // a topic only makes sense inside a chapter
    }
    if (newTopicId) {
      const topic = await db.topic.findUnique({ where: { id: newTopicId }, select: { chapterId: true } });
      if (!topic || topic.chapterId !== newChapterId) return { ok: false, error: "That topic does not belong to the chosen chapter." };
    }
    if (newChapterId !== material.chapterId) {
      data.chapterId = newChapterId;
      changes.push(`placed in ${newChapterId ? `chapter "${newChapterName}"` : "the whole subject"} (was ${material.chapterId ? `chapter "${material.chapter?.name ?? "?"}"` : "the whole subject"})`);
    }
    if (newTopicId !== material.topicId) {
      data.topicId = newTopicId;
      if (newChapterId === material.chapterId) changes.push(newTopicId ? "topic changed" : "topic cleared");
    }
  }

  if (Object.keys(data).length === 0) return { ok: false, error: "Nothing to change." };

  const passages = await db.$transaction(async (tx) => {
    await tx.studyMaterial.update({ where: { id: material.id }, data });
    if (data.chapterId !== undefined || data.topicId !== undefined) {
      const moved = await tx.materialChunk.updateMany({
        where: { materialId: material.id },
        data: { ...(data.chapterId !== undefined ? { chapterId: data.chapterId } : {}), ...(data.topicId !== undefined ? { topicId: data.topicId } : {}) },
      });
      return moved.count;
    }
    return 0;
  });
  return { ok: true, title: data.title ?? material.title, changes, passages };
}
