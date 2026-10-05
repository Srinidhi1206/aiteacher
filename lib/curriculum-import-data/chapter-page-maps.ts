// Which PDF pages belong to which chapter, for the SPECIFIC uploaded textbook files this school has - so indexed passages can be
// linked to their chapter. Each entry is keyed by the SHA-256 of that exact file: a different edition or re-export of the same book
// has a different hash and gets no links (its passages stay whole-subject) instead of wrong ones.
//
// How the page numbers were established (nothing is guessed): for each file the chapter-opening pages were found from the book's own
// markers (the printed "N | Chapter" or "CHAPTER N" opener, or the "N.1 INTRODUCTION" heading), cross-checked against the printed
// contents page and the printed page numbers (PDF page = printed page + 10 in Mathematics, + 12 in the others, with the one edition
// difference that Physical Science chapters 6 and 7 start a page later than in the older edition). A chapter runs from its opening
// page to the page before the next chapter; the last chapter ends where the book's own back matter (answers, practice maps) begins.
// Pages outside every chapter (front matter, answers, maps) are simply not linked.
import { TELANGANA_BSE_CLASS10_MATHEMATICS } from "./telangana-bse-class10-mathematics";
import { TELANGANA_BSE_CLASS10_PHYSICAL_SCIENCE } from "./telangana-bse-class10-physical-science";
import { TELANGANA_BSE_CLASS10_BIOLOGICAL_SCIENCE } from "./telangana-bse-class10-biological-science";
import { TELANGANA_BSE_CLASS10_SOCIAL_STUDIES } from "./telangana-bse-class10-social-studies";

export interface ChapterPageRange {
  slug: string;
  /** First and last PDF page (1-based, inclusive). */
  start: number;
  end: number;
}
export interface ChapterPageMap {
  label: string;
  subjectSlug: string;
  ranges: ChapterPageRange[];
}

/** Builds contiguous ranges from each chapter's opening page, ending the last one at `lastPage`. */
export function rangesFromStarts(slugs: string[], starts: number[], lastPage: number): ChapterPageRange[] {
  if (slugs.length !== starts.length) throw new Error("chapter-page-maps: slugs and starts differ in length");
  return slugs.map((slug, i) => ({ slug, start: starts[i], end: i + 1 < starts.length ? starts[i + 1] - 1 : lastPage }));
}

export const CHAPTER_PAGE_MAPS: Record<string, ChapterPageMap> = {
  "67d37e7f3aab64a280d2b4276d36c126106ae7f524049321055c0974d7f1bec2": {
    label: "Class 10 Mathematics (xth_maths_em.pdf, 2019-20)",
    subjectSlug: "mathematics",
    ranges: rangesFromStarts(TELANGANA_BSE_CLASS10_MATHEMATICS.map((c) => c.slug), [11, 38, 61, 87, 115, 139, 173, 205, 239, 259, 283, 308, 319, 337, 367], 379),
  },
  ca2c9dbee7d934b456da98a4961f6b7945121bd0e2c37796f33ba46a40559eb9: {
    label: "Class 10 Physical Science (10_physics_em_-_20.pdf, 2020-21)",
    subjectSlug: "science",
    ranges: rangesFromStarts(TELANGANA_BSE_CLASS10_PHYSICAL_SCIENCE.map((c) => c.slug), [13, 32, 45, 69, 93, 119, 135, 162, 188, 221, 249, 265], 306),
  },
  "4590d0f7c59f1965d42932feb4eeed6a1f7517fc470ed79c488641d6f82509f9": {
    label: "Class 10 Biological Science (x_biology_em.pdf, 2019-20)",
    subjectSlug: "biological-science",
    ranges: rangesFromStarts(TELANGANA_BSE_CLASS10_BIOLOGICAL_SCIENCE.map((c) => c.slug), [13, 36, 60, 86, 106, 128, 156, 178, 205, 224], 242),
  },
  "5d2773ce5ca36deb612718bae09746807ce3026ed5b3d5c638917d07badf48dd": {
    label: "Class 10 Social Studies (10th_social_em.pdf, 2019-20)",
    subjectSlug: "social-science",
    ranges: rangesFromStarts(TELANGANA_BSE_CLASS10_SOCIAL_STUDIES.map((c) => c.slug), [13, 26, 40, 56, 70, 83, 99, 114, 129, 143, 157, 174, 198, 214, 228, 244, 254, 270, 288, 304, 320], 336),
  },
};

/** The chapter a PDF page belongs to, or null (front matter, answers, maps, or no map for this file). */
export function chapterSlugForPage(map: ChapterPageMap | undefined, page: number | null): string | null {
  if (!map || page === null) return null;
  return map.ranges.find((r) => page >= r.start && page <= r.end)?.slug ?? null;
}
