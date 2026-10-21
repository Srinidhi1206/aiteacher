// Which chapters of a subject a page should show. A Study Plan task is about ONE chapter ("Study: Real Numbers · for Unit Test 2"), so its "Chapters & materials" link opens the subject page narrowed to that chapter:
// /subjects/<subjectId>?chapter=<chapterId>. The scope lives in the URL, so a refresh, a bookmark or a shared link shows the same chapter; with no `chapter` parameter the page shows every chapter exactly as before.
// Pure, so the Study Plan, the subject page and the tests use the same rule. Chapters are matched by their database id, never by name.
export const CHAPTER_PARAM = "chapter";

const PLAUSIBLE_ID = /^[A-Za-z0-9_-]{1,64}$/;
const MAX_CHAPTERS = 30;

/** The chapter ids in a `?chapter=` value: repeated (`chapter=a&chapter=b`) or comma-separated (`chapter=a,b`); anything that is not a plausible id is dropped, duplicates are kept once. */
export function parseChapterScope(value: string | string[] | undefined): string[] {
  const raw = (Array.isArray(value) ? value : value === undefined ? [] : [value]).flatMap((v) => v.split(","));
  const out: string[] = [];
  for (const piece of raw) {
    const id = piece.trim();
    if (PLAUSIBLE_ID.test(id) && !out.includes(id) && out.length < MAX_CHAPTERS) out.push(id);
  }
  return out;
}

/** The subject page narrowed to these chapters (one `chapter` parameter each); the whole subject when none are given. */
export function chapterScopeHref(subjectId: string, chapterIds: string[]): string {
  const ids = chapterIds.filter((id) => PLAUSIBLE_ID.test(id));
  return ids.length === 0 ? `/subjects/${subjectId}` : `/subjects/${subjectId}?${ids.map((id) => `${CHAPTER_PARAM}=${encodeURIComponent(id)}`).join("&")}`;
}

export interface ScopedChapters<T> {
  /** The chapters to show, each with its position (1-based) in the WHOLE subject, so a scoped "Real Numbers" is still chapter 1 of 15. */
  shown: { chapter: T; number: number }[];
  /** Ids asked for that the subject does not have (a stale link, a chapter of another subject). */
  unknownIds: string[];
  /** True when a scope was asked for and at least one of its chapters exists: only those chapters are shown. */
  scoped: boolean;
}

/**
 * Narrows a subject's chapters (in the book's order) to the asked-for ones. With no scope, every chapter. With a scope whose ids match NOTHING, every chapter is shown too - but `unknownIds` says so,
 * so the page can tell the student the link did not match instead of silently pretending it did.
 */
export function scopeChapters<T extends { id: string }>(chapters: T[], ids: string[]): ScopedChapters<T> {
  const all = chapters.map((chapter, i) => ({ chapter, number: i + 1 }));
  if (ids.length === 0) return { shown: all, unknownIds: [], scoped: false };
  const wanted = new Set(ids);
  const shown = all.filter((x) => wanted.has(x.chapter.id));
  const unknownIds = ids.filter((id) => !chapters.some((c) => c.id === id));
  return shown.length === 0 ? { shown: all, unknownIds, scoped: false } : { shown, unknownIds, scoped: true };
}
