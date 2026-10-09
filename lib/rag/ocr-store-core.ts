// Where an OCR run keeps its text: one small JSON file per window of pages under ocr/<materialId>/ in the same file storage as the
// textbook, so a run can stop anywhere (quota, timeout, closed tab, blocked storage) and resume without re-reading a page, and indexing can
// later build its passages from exactly this text. The textbook PDF itself is never touched.
//
// This is the testable core: storage and network are passed in. lib/rag/ocr-store.ts wires the real ones.
import { assembleOcrPages, type OcrWindowFile } from "@/lib/rag/ocr";
import { assertStorageAvailable, isBlockedHttp, markStorageBlocked, StorageBlockedError } from "@/lib/storage/blocked";

export interface OcrStorage {
  list(prefix: string): Promise<{ pathname: string; url: string }[]>;
  upload(params: { file: Blob; pathname: string; contentType: string }): Promise<unknown>;
  delete(storageKey: string): Promise<void>;
}

export interface CompleteOcr {
  pages: string[];
  totalPages: number;
  sourceSha256: string;
}

const prefix = (materialId: string) => `ocr/${materialId}/`;
const NAME = /\/w(\d+)-(\d+)[^/]*\.json$/;

/** A finished run never changes, so it is remembered for a while: later indexing calls need no listing and no window fetches. */
const MEMO_TTL_MS = 15 * 60 * 1000;
const MEMO_MAX = 3;

export function createOcrStore(deps: { storage: OcrStorage; fetchFn?: typeof fetch; now?: () => number }) {
  const { storage } = deps;
  const fetchFn = deps.fetchFn ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
  const now = deps.now ?? Date.now;
  const memo = new Map<string, { value: CompleteOcr; at: number }>();

  async function listWindows(materialId: string): Promise<{ start: number; end: number; url: string }[]> {
    assertStorageAvailable(now());
    const rows = await storage.list(prefix(materialId));
    const out: { start: number; end: number; url: string }[] = [];
    for (const r of rows) {
      const m = NAME.exec(r.pathname);
      if (m) out.push({ start: Number(m[1]), end: Number(m[2]), url: r.url });
    }
    return out;
  }

  async function fetchWindow(url: string): Promise<OcrWindowFile | null> {
    assertStorageAvailable(now());
    const res = await fetchFn(url);
    if (res.status === 403) {
      if (isBlockedHttp(res.status, (await res.text().catch(() => "")).slice(0, 200))) {
        markStorageBlocked(now());
        throw new StorageBlockedError();
      }
      return null;
    }
    if (!res.ok) return null;
    try {
      const j = (await res.json()) as OcrWindowFile;
      return j?.version === 1 && Array.isArray(j.pages) ? j : null;
    } catch {
      return null;
    }
  }

  return {
    /** Every page already read, whatever the window size it was read in (one listing, nothing downloaded). */
    async savedPages(materialId: string): Promise<Set<number>> {
      const pages = new Set<number>();
      for (const w of await listWindows(materialId)) for (let p = w.start; p <= w.end; p++) pages.add(p);
      return pages;
    },

    async saveWindow(materialId: string, w: OcrWindowFile): Promise<void> {
      await storage.upload({ file: new Blob([JSON.stringify(w)], { type: "application/json" }), pathname: `${prefix(materialId)}w${w.startPage}-${w.endPage}.json`, contentType: "application/json" });
      memo.delete(materialId);
    },

    /** The whole run's text, or null unless every page is there. A blocked store is NEVER reported as "no OCR text": it throws. */
    async loadCompleteOcr(materialId: string): Promise<CompleteOcr | null> {
      const hit = memo.get(materialId);
      if (hit && now() - hit.at < MEMO_TTL_MS) return hit.value;
      let listed;
      try {
        listed = await listWindows(materialId);
      } catch (e) {
        if (e instanceof StorageBlockedError) throw e;
        return null; // storage not configured / otherwise unreachable: behave as "no OCR text"
      }
      if (listed.length === 0) return null;
      const byRange = new Map<string, string>();
      for (const w of listed) if (!byRange.has(`${w.start}-${w.end}`)) byRange.set(`${w.start}-${w.end}`, w.url);
      const files: OcrWindowFile[] = [];
      const entries = [...byRange.values()];
      for (let i = 0; i < entries.length; i += 10) {
        const got = await Promise.all(entries.slice(i, i + 10).map(fetchWindow));
        for (const g of got) if (g) files.push(g);
      }
      const assembled = assembleOcrPages(files);
      if (!assembled.complete || assembled.sourceSha256 === null) return null;
      const value = { pages: assembled.pages, totalPages: assembled.totalPages, sourceSha256: assembled.sourceSha256 };
      if (memo.size >= MEMO_MAX) memo.delete(memo.keys().next().value as string);
      memo.set(materialId, { value, at: now() });
      return value;
    },

    /** Which file an OCR run read (its SHA-256) and how many pages it has - from ONE small window file, not the PDF. */
    async readOcrIdentity(materialId: string): Promise<{ sourceSha256: string; totalPages: number } | null> {
      const listed = await listWindows(materialId);
      if (listed.length === 0) return null;
      const w = await fetchWindow(listed[0].url);
      return w ? { sourceSha256: w.sourceSha256, totalPages: w.totalPages } : null;
    },

    /** Removes a material's OCR text (used when the material is deleted). Best effort - but a blocked store still opens the breaker. */
    async deleteOcr(materialId: string): Promise<void> {
      try {
        const rows = await (async () => {
          assertStorageAvailable(now());
          return storage.list(prefix(materialId));
        })();
        await Promise.all(rows.map((r) => storage.delete(r.pathname).catch(() => {})));
        memo.delete(materialId);
      } catch {
        /* nothing stored, or storage unavailable */
      }
    },

    forget(materialId: string): void {
      memo.delete(materialId);
    },
  };
}
