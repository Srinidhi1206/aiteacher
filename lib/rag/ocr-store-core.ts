// Where an OCR run keeps its text: one small JSON file per window of pages under ocr/<materialId>/ in the same file storage as the
// textbook, so a run can stop anywhere (quota, timeout, closed tab, blocked storage) and resume without re-reading a page, and indexing can
// later build its passages from exactly this text. The textbook PDF itself is never touched.
//
// Three rules keep a run RECOVERABLE:
//   * a window only counts once it has been read back and checked (well-formed, the right page range, the same book as its neighbours) - a file
//     that merely exists is not "a page read";
//   * a corrupt or empty file never shadows a good one for the same pages, and re-reading its pages simply adds a good one;
//   * "storage could not be read just now" is its own answer (`unavailable`) - never mistaken for "no OCR text" or for "incomplete".
//
// This is the testable core: storage and network are passed in. lib/rag/ocr-store.ts wires the real ones.
import { assembleOcrPages, type OcrWindowFile } from "@/lib/rag/ocr";
import { assertStorageAvailable, isBlockedHttp, markStorageBlocked, StorageBlockedError } from "@/lib/storage/blocked";

export interface OcrStorage {
  list(prefix: string): Promise<{ pathname: string; url: string }[]>;
  upload(params: { file: Blob; pathname: string; contentType: string }): Promise<unknown>;
  delete(storageKey: string): Promise<void>;
}

export type OcrState =
  | { kind: "complete"; pages: string[]; totalPages: number; sourceSha256: string }
  /** Nothing has been stored for this book. */
  | { kind: "none" }
  /** Some pages are stored and valid; others are missing or their files are unusable. Reading the rest repairs it. */
  | { kind: "incomplete"; validPages: number; totalPages: number | null }
  /** Storage could not be read right now (not blocked): nothing is known, nothing should be changed. */
  | { kind: "unavailable" };

export class OcrStorageUnavailableError extends Error {
  constructor() {
    super("The saved page-reading results could not be read just now.");
    this.name = "OcrStorageUnavailableError";
  }
}

const prefix = (materialId: string) => `ocr/${materialId}/`;
const NAME = /\/w(\d+)-(\d+)[^/]*\.json$/;
const EMPTY_SHA = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
const SHA = /^[0-9a-f]{64}$/;

/** A finished run never changes, so it is remembered for a while: later indexing calls need no listing and no window fetches. */
const MEMO_TTL_MS = 15 * 60 * 1000;
const MEMO_MAX = 3;

/** A window file is usable only if it is exactly what the OCR pass writes: right shape, right pages, a real file hash. Null = not usable. */
export function validateWindowFile(raw: unknown, range: { start: number; end: number }): OcrWindowFile | null {
  const w = raw as Partial<OcrWindowFile> | null;
  if (!w || typeof w !== "object" || w.version !== 1) return null;
  const { totalPages, startPage, endPage, pages, sourceSha256 } = w;
  if (!Number.isInteger(totalPages) || !Number.isInteger(startPage) || !Number.isInteger(endPage)) return null;
  if (startPage !== range.start || endPage !== range.end) return null; // the file must be the pages its name says
  if ((totalPages as number) < 1 || (startPage as number) < 1 || (endPage as number) < (startPage as number) || (endPage as number) > (totalPages as number)) return null;
  if (!Array.isArray(pages) || pages.length !== (endPage as number) - (startPage as number) + 1 || !pages.every((p) => typeof p === "string")) return null;
  if (typeof sourceSha256 !== "string" || !SHA.test(sourceSha256) || sourceSha256 === EMPTY_SHA) return null;
  return w as OcrWindowFile;
}

type WindowFetch = { ok: true; file: OcrWindowFile } | { ok: false; reason: "invalid" | "transient" };

export interface OcrInspection {
  listedRanges: number;
  validPages: Set<number>;
  totalPages: number | null;
  sourceSha256: string | null;
  files: OcrWindowFile[];
  complete: boolean;
  /** Some range has no usable file AND at least one of its files could not be read just now (so it may be fine). */
  transient: boolean;
}

export function createOcrStore(deps: { storage: OcrStorage; fetchFn?: typeof fetch; now?: () => number }) {
  const { storage } = deps;
  const fetchFn = deps.fetchFn ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
  const now = deps.now ?? Date.now;
  const memo = new Map<string, { value: Extract<OcrState, { kind: "complete" }>; at: number }>();

  async function listWindows(materialId: string): Promise<{ start: number; end: number; pathname: string; url: string }[]> {
    assertStorageAvailable(now());
    const rows = await storage.list(prefix(materialId));
    const out: { start: number; end: number; pathname: string; url: string }[] = [];
    for (const r of rows) {
      const m = NAME.exec(r.pathname);
      if (m) out.push({ start: Number(m[1]), end: Number(m[2]), pathname: r.pathname, url: r.url });
    }
    return out.sort((a, b) => (a.pathname < b.pathname ? -1 : a.pathname > b.pathname ? 1 : 0)); // a stable order, so choices never flip
  }

  async function fetchWindow(w: { start: number; end: number; url: string }): Promise<WindowFetch> {
    assertStorageAvailable(now());
    let res: Response;
    try {
      res = await fetchFn(w.url);
    } catch (e) {
      if (e instanceof StorageBlockedError) throw e;
      return { ok: false, reason: "transient" };
    }
    if (res.status === 403 && isBlockedHttp(res.status, (await res.text().catch(() => "")).slice(0, 200))) {
      markStorageBlocked(now());
      throw new StorageBlockedError();
    }
    if (res.status === 404 || res.status === 410) return { ok: false, reason: "invalid" }; // listed but gone
    if (!res.ok) return { ok: false, reason: "transient" };
    let json: unknown;
    try {
      json = await res.json();
    } catch {
      return { ok: false, reason: "invalid" }; // unreadable / truncated
    }
    const file = validateWindowFile(json, w);
    return file ? { ok: true, file } : { ok: false, reason: "invalid" };
  }

  /** Lists the windows and reads each back once (trying a range's other files only if the first is unusable). */
  async function inspect(materialId: string): Promise<OcrInspection> {
    const listed = await listWindows(materialId);
    const byRange = new Map<string, typeof listed>();
    for (const w of listed) {
      const key = `${w.start}-${w.end}`;
      byRange.set(key, [...(byRange.get(key) ?? []), w]);
    }
    const ranges = [...byRange.values()];
    const found: OcrWindowFile[] = [];
    let transientRanges = 0;
    for (let i = 0; i < ranges.length; i += 10) {
      const results = await Promise.all(
        ranges.slice(i, i + 10).map(async (candidates) => {
          let sawTransient = false;
          for (const c of candidates) {
            const r = await fetchWindow(c);
            if (r.ok) return { file: r.file, transient: false };
            if (r.reason === "transient") sawTransient = true;
          }
          return { file: null, transient: sawTransient };
        }),
      );
      for (const r of results) {
        if (r.file) found.push(r.file);
        else if (r.transient) transientRanges++;
      }
    }
    // All files must describe the same book; if they disagree, the most common description wins (ties: the one starting earliest).
    const tally = new Map<string, { n: number; first: number; total: number; sha: string }>();
    for (const f of found) {
      const key = `${f.totalPages}|${f.sourceSha256}`;
      const t = tally.get(key) ?? { n: 0, first: f.startPage, total: f.totalPages, sha: f.sourceSha256 };
      t.n++;
      t.first = Math.min(t.first, f.startPage);
      tally.set(key, t);
    }
    const best = [...tally.values()].sort((a, b) => b.n - a.n || a.first - b.first)[0];
    const files = best ? found.filter((f) => f.totalPages === best.total && f.sourceSha256 === best.sha) : [];
    const validPages = new Set<number>();
    for (const f of files) for (let p = f.startPage; p <= f.endPage; p++) validPages.add(p);
    const totalPages = best?.total ?? null;
    let complete = totalPages !== null;
    if (totalPages !== null) for (let p = 1; p <= totalPages; p++) if (!validPages.has(p)) complete = false;
    return { listedRanges: ranges.length, validPages, totalPages, sourceSha256: best?.sha ?? null, files, complete, transient: !complete && transientRanges > 0 };
  }

  return {
    /** Pages whose files EXIST (names only: one listing, nothing downloaded). Use `verifySaved` before treating them as read. */
    async savedPages(materialId: string): Promise<Set<number>> {
      const pages = new Set<number>();
      for (const w of await listWindows(materialId)) for (let p = w.start; p <= w.end; p++) pages.add(p);
      return pages;
    },

    /** Pages whose files have been read back and checked. Throws OcrStorageUnavailableError on a temporary problem, StorageBlockedError if blocked. */
    async verifySaved(materialId: string): Promise<{ validPages: Set<number>; totalPages: number | null }> {
      let result: OcrInspection;
      try {
        result = await inspect(materialId);
      } catch (e) {
        if (e instanceof StorageBlockedError) throw e;
        throw new OcrStorageUnavailableError();
      }
      if (result.transient) throw new OcrStorageUnavailableError();
      return { validPages: result.validPages, totalPages: result.totalPages };
    },

    async saveWindow(materialId: string, w: OcrWindowFile): Promise<void> {
      await storage.upload({ file: new Blob([JSON.stringify(w)], { type: "application/json" }), pathname: `${prefix(materialId)}w${w.startPage}-${w.endPage}.json`, contentType: "application/json" });
      memo.delete(materialId);
    },

    /**
     * What indexing may rely on. `complete` carries the text; `unavailable` means "could not tell right now" - callers must not change anything and
     * must not fetch the PDF because of it. A blocked store throws.
     */
    async readOcrState(materialId: string): Promise<OcrState> {
      const hit = memo.get(materialId);
      if (hit && now() - hit.at < MEMO_TTL_MS) return hit.value;
      let result: OcrInspection;
      try {
        result = await inspect(materialId);
      } catch (e) {
        if (e instanceof StorageBlockedError) throw e;
        return { kind: "unavailable" };
      }
      if (result.listedRanges === 0) return { kind: "none" };
      if (result.complete && result.sourceSha256 !== null) {
        const assembled = assembleOcrPages(result.files);
        if (assembled.complete && assembled.sourceSha256 !== null) {
          const value = { kind: "complete" as const, pages: assembled.pages, totalPages: assembled.totalPages, sourceSha256: assembled.sourceSha256 };
          if (memo.size >= MEMO_MAX) memo.delete(memo.keys().next().value as string);
          memo.set(materialId, { value, at: now() });
          return value;
        }
      }
      if (result.transient) return { kind: "unavailable" };
      return { kind: "incomplete", validPages: result.validPages.size, totalPages: result.totalPages };
    },

    /** Which file an OCR run read (its SHA-256) - from the first usable window file, not the PDF. Null if none; throws on a temporary problem. */
    async readOcrIdentity(materialId: string): Promise<{ sourceSha256: string; totalPages: number } | null> {
      let listed;
      try {
        listed = await listWindows(materialId);
      } catch (e) {
        if (e instanceof StorageBlockedError) throw e;
        throw new OcrStorageUnavailableError();
      }
      let transient = false;
      for (const w of listed) {
        const r = await fetchWindow(w);
        if (r.ok) return { sourceSha256: r.file.sourceSha256, totalPages: r.file.totalPages };
        if (r.reason === "transient") transient = true;
      }
      if (transient) throw new OcrStorageUnavailableError();
      return null;
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
