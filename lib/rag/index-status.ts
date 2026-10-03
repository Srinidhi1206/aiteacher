// Human-readable indexing status for a study material, shared by the indexing action (which writes
// it) and the admin screen (which reads it). It is stored in StudyMaterial.indexError - there is no
// separate status column and no schema change - so the wording lives in one place and both sides parse
// the same strings. A real failure message never matches any of these, so it still reads as an error.
// Deliberately free of server-only imports: the browser bundle uses it too.

export type IndexStatusNote =
  | { kind: "in_progress"; done: number; total: number }
  | { kind: "complete"; total: number }
  | { kind: "truncated"; done: number; available: number };

export function formatIndexStatus(note: IndexStatusNote): string {
  switch (note.kind) {
    case "in_progress":
      return `Indexing in progress: ${note.done} / ${note.total} passages.`;
    case "complete":
      return `Complete: ${note.total} / ${note.total} passages.`;
    case "truncated":
      return `Partial: indexed the first ${note.done} of ${note.available} passages (the per-material limit was reached).`;
  }
}

export function parseIndexStatus(text: string | null | undefined): IndexStatusNote | null {
  if (!text) return null;
  let m = /^Indexing in progress: (\d+) \/ (\d+) passages\.$/.exec(text);
  if (m) return { kind: "in_progress", done: Number(m[1]), total: Number(m[2]) };
  m = /^Complete: (\d+) \/ (\d+) passages\.$/.exec(text);
  if (m) return { kind: "complete", total: Number(m[2]) };
  m = /^Partial: indexed the first (\d+) of (\d+) passages/.exec(text);
  if (m) return { kind: "truncated", done: Number(m[1]), available: Number(m[2]) };
  return null;
}
