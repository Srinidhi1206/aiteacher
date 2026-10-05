// Linking a material's passages to its chapters, for files whose chapter pages were established and checked
// (lib/curriculum-import-data/chapter-page-maps.ts, keyed by the file's SHA-256). Used while indexing and by the stand-alone
// "link chapters" action. Writes only MaterialChunk.chapterId; never touches text, embeddings or page numbers.
import { prisma } from "@/lib/prisma";
import { CHAPTER_PAGE_MAPS, type ChapterPageMap } from "@/lib/curriculum-import-data/chapter-page-maps";

export interface ChapterLinkPlan {
  pageMap: ChapterPageMap;
  chapterIdBySlug: Map<string, string>;
}

/** The plan for this file, or null when there is no verified map for it or the subject does not have every chapter the map names. */
export async function planChapterLinks(subjectId: string, sourceSha: string | null): Promise<ChapterLinkPlan | null> {
  const pageMap = sourceSha ? CHAPTER_PAGE_MAPS[sourceSha] : undefined;
  if (!pageMap) return null;
  const rows = await prisma.chapter.findMany({ where: { subjectId, slug: { in: pageMap.ranges.map((r) => r.slug) } }, select: { id: true, slug: true } });
  if (rows.length !== pageMap.ranges.length) return null; // a partly matching chapter list is not trusted
  return { pageMap, chapterIdBySlug: new Map(rows.map((r) => [r.slug, r.id])) };
}

/** Sets the chapter on every saved passage whose page falls in a chapter. Idempotent. Returns how many passages changed. */
export async function linkSavedPassages(materialId: string, plan: ChapterLinkPlan): Promise<number> {
  let changed = 0;
  for (const r of plan.pageMap.ranges) {
    const chapterId = plan.chapterIdBySlug.get(r.slug) as string;
    const res = await prisma.materialChunk.updateMany({
      where: { materialId, page: { gte: r.start, lte: r.end }, OR: [{ chapterId: null }, { chapterId: { not: chapterId } }] },
      data: { chapterId },
    });
    changed += res.count;
  }
  return changed;
}
