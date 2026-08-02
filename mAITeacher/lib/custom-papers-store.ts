import { Paper } from "@/lib/types";

// Custom-generated papers only need to survive within the current browser
// session (created on the Practice Papers page, then opened in the attempt
// flow), so sessionStorage is enough — no backend required for this mock app.
const KEY = "maiteacher-custom-papers";

export function getCustomPapers(): Paper[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Paper[]) : [];
  } catch {
    return [];
  }
}

export function saveCustomPaper(paper: Paper) {
  if (typeof window === "undefined") return;
  const existing = getCustomPapers();
  window.sessionStorage.setItem(KEY, JSON.stringify([paper, ...existing]));
}

export function getCustomPaperById(id: string): Paper | undefined {
  return getCustomPapers().find((p) => p.id === id);
}
