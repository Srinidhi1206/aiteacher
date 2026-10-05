// Where an OCR run keeps its text: one small JSON file per window of pages under ocr/<materialId>/ in the same file storage as the
// textbook, so a run can stop anywhere (quota, timeout, closed tab) and resume without re-reading a page, and indexing can later
// build its passages from exactly this text. The textbook PDF itself is never touched.
import "server-only";
import { storage } from "@/lib/storage";
import { assembleOcrPages, type OcrWindowFile } from "@/lib/rag/ocr";

const prefix = (materialId: string) => `ocr/${materialId}/`;
const NAME = /\/w(\d+)-(\d+)[^/]*\.json$/;

async function listWindows(materialId: string): Promise<{ start: number; end: number; url: string }[]> {
  const rows = await storage.list(prefix(materialId));
  const out: { start: number; end: number; url: string }[] = [];
  for (const r of rows) {
    const m = NAME.exec(r.pathname);
    if (m) out.push({ start: Number(m[1]), end: Number(m[2]), url: r.url });
  }
  return out;
}

/** First page of every window already saved (cheap: only the file listing is read). */
export async function savedWindowStarts(materialId: string): Promise<Set<number>> {
  return new Set((await listWindows(materialId)).map((w) => w.start));
}

export async function saveWindow(materialId: string, w: OcrWindowFile): Promise<void> {
  await storage.upload({ file: new Blob([JSON.stringify(w)], { type: "application/json" }), pathname: `${prefix(materialId)}w${w.startPage}-${w.endPage}.json`, contentType: "application/json" });
}

async function fetchWindow(url: string): Promise<OcrWindowFile | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const j = (await res.json()) as OcrWindowFile;
    return j?.version === 1 && Array.isArray(j.pages) ? j : null;
  } catch {
    return null;
  }
}

/** The whole run's text, or null unless every page is there. Reads each window file once. */
export async function loadCompleteOcr(materialId: string): Promise<{ pages: string[]; totalPages: number; sourceSha256: string } | null> {
  let listed;
  try {
    listed = await listWindows(materialId);
  } catch {
    return null; // storage not configured / not reachable: behave as "no OCR text"
  }
  if (listed.length === 0) return null;
  const byStart = new Map<number, string>();
  for (const w of listed) if (!byStart.has(w.start)) byStart.set(w.start, w.url);
  const files: OcrWindowFile[] = [];
  const entries = [...byStart.values()];
  for (let i = 0; i < entries.length; i += 10) {
    const got = await Promise.all(entries.slice(i, i + 10).map(fetchWindow));
    for (const g of got) if (g) files.push(g);
  }
  const assembled = assembleOcrPages(files);
  if (!assembled.complete || assembled.sourceSha256 === null) return null;
  return { pages: assembled.pages, totalPages: assembled.totalPages, sourceSha256: assembled.sourceSha256 };
}

/** Removes a material's OCR text (used when the material is deleted). Best effort. */
export async function deleteOcr(materialId: string): Promise<void> {
  try {
    const rows = await storage.list(prefix(materialId));
    await Promise.all(rows.map((r) => storage.delete(r.pathname).catch(() => {})));
  } catch {
    /* nothing stored, or storage unavailable */
  }
}
