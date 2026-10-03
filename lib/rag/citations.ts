// The "Sources:" line under a tutor answer: which of the student's own books the answer drew on, and on which pages.
// Pure, so it can be tested on its own. Only passages that were actually given to the tutor are ever listed.
export interface CitedPassage {
  materialTitle: string;
  page: number | null;
}

/** "Book title (pages 23, 25, 29); Another book (page 4)" - pages grouped per book, in page order, each listed once. */
export function sourcesLine(passages: CitedPassage[]): string {
  const pagesByTitle = new Map<string, number[]>();
  for (const p of passages) {
    const pages = pagesByTitle.get(p.materialTitle) ?? [];
    if (p.page && !pages.includes(p.page)) pages.push(p.page);
    pagesByTitle.set(p.materialTitle, pages);
  }
  return [...pagesByTitle]
    .map(([title, pages]) => {
      pages.sort((a, b) => a - b);
      return pages.length === 0 ? title : `${title} (${pages.length > 1 ? "pages" : "page"} ${pages.join(", ")})`;
    })
    .join("; ");
}
