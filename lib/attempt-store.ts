const PREFIX = "maiteacher-attempt-";

export interface StoredAttempt {
  answers: Record<string, string>;
  timeTakenSeconds: number;
}

export function saveAttempt(paperId: string, data: StoredAttempt) {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(PREFIX + paperId, JSON.stringify(data));
}

export function getAttempt(paperId: string): StoredAttempt | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(PREFIX + paperId);
    return raw ? (JSON.parse(raw) as StoredAttempt) : null;
  } catch {
    return null;
  }
}
