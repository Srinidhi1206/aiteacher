// Which chapters of a subject are LESSONS a student can be asked to study, and which only exist to hold a book.
//
// Real case: the English subject has eight genuine units (each with its lessons) plus one chapter, "SCERT Textbook (test)", that was created only so the whole textbook
// had somewhere to be filed. The study plan turns every chapter into a "Study: <chapter>" task, so that placeholder became a task. The rule that skips it is deliberately
// narrow - a chapter is skipped ONLY when ALL of these hold:
//   1. it has no lessons (topics) of its own;
//   2. a textbook is filed under it (so it is where a book lives, not a lesson that is merely still empty);
//   3. other chapters of the same subject DO have lessons (so the subject is structured, and this is the odd one out).
// A topic-less chapter that holds no textbook (an "Appendix", a chapter whose lessons have not been entered yet), and every chapter of a subject with no lessons anywhere
// (Mathematics, Hindi, ...), is kept. When the information is not available (the fields are undefined) nothing is skipped. Nothing is changed in the curriculum itself.
export interface ChapterFacts {
  id: string;
  name: string;
  /** How many lessons (topics) the chapter has; undefined = unknown. */
  topicCount?: number;
  /** Whether a textbook-type study material is filed directly under the chapter; undefined = unknown. */
  hasTextbookMaterial?: boolean;
}

export function isBookHolderChapter(chapter: ChapterFacts, siblings: ChapterFacts[]): boolean {
  if (chapter.topicCount !== 0 || chapter.hasTextbookMaterial !== true) return false;
  return siblings.some((s) => s.id !== chapter.id && (s.topicCount ?? 0) > 0);
}

/** The chapters to plan from, in the order given, without the ones that only hold a book. */
export function planChapters<T extends ChapterFacts>(chapters: T[]): T[] {
  return chapters.filter((c) => !isBookHolderChapter(c, chapters));
}
