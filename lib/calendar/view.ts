// Which calendar events the admin table shows. Drafts are real, saved events (isPublished = false); this is how a saved import is found again.
export type CalendarView = "all" | "drafts" | "published";

export function filterByView<T extends { isPublished: boolean }>(events: T[], view: CalendarView): T[] {
  return view === "all" ? events : events.filter((e) => (view === "drafts" ? !e.isPublished : e.isPublished));
}

export function countDrafts(events: { isPublished: boolean }[]): number {
  return events.filter((e) => !e.isPublished).length;
}
