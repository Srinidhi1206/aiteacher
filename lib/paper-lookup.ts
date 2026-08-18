import { Paper } from "@/lib/types";
import { getPaperById } from "@/lib/mock-data/papers";
import { getCustomPaperById } from "@/lib/custom-papers-store";

// Looks across the static paper bank and any session-generated custom
// papers. Custom papers only exist client-side (sessionStorage), so this
// should be called from a client component (e.g. inside useEffect).
export function findAnyPaper(id: string): Paper | undefined {
  return getPaperById(id) ?? getCustomPaperById(id);
}
