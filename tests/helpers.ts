// Shared fakes for the offline tests. Nothing here contacts Vercel Blob, Gemini, a database or the network: storage, `fetch` and the ledger are
// fakes that COUNT how often they are used, because "was it downloaded again?" is what is being proved.
import { createPdfDownloader } from "@/lib/rag/pdf-cache";
import { createMemoryLedger, type DownloadBudget, type DownloadLedger } from "@/lib/storage/download-budget";
import { recordDownloadEvent } from "@/lib/storage/telemetry";
import type { OcrStorage } from "@/lib/rag/ocr-store-core";
import type { OcrWindowFile } from "@/lib/rag/ocr";
import type { PageRenderer } from "@/lib/rag/ocr-render";
import type { OcrRunDeps } from "@/lib/rag/ocr-run";
import type { PdfFetch } from "@/lib/rag/pdf-cache";

export const MB = 1024 * 1024;
export const SECRET_URL = "https://abc123.public.blob.vercel-storage.com/materials/c1/s1/book-AbCdEfGhIjKlMnOpQrStUvWxYz012345.pdf";
export const HEX_A = "a".repeat(64);
export const HEX_B = "b".repeat(64);
export const EMPTY_SHA = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

// ---------- network ----------

export function fakeNetwork(handler: (url: string) => Response | Promise<Response>) {
  const calls: string[] = [];
  const fetchFn = (async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    return handler(url);
  }) as typeof fetch;
  return { fetchFn, calls };
}

export const pdfResponse = (size = 1000, fill = 7) => new Response(new Uint8Array(size).fill(fill), { status: 200, headers: { "content-length": String(size) } });
export const bytesResponse = (bytes: Uint8Array) => new Response(bytes.slice(), { status: 200, headers: { "content-length": String(bytes.length) } });
export const blockedResponse = () => new Response("Your store is blocked", { status: 403 });

// ---------- time ----------

export function clock(start = 1_000_000_000_000) {
  let t = start;
  return { now: () => t, advance: (ms: number) => (t += ms) };
}

// ---------- downloader ----------

export const BUDGET: DownloadBudget = { perMaterialPerHour: 3, perMaterialPerDayBytes: 50 * MB, globalPerDayBytes: 80 * MB };

export function downloader(
  handler: (url: string) => Response | Promise<Response>,
  opts: { ledger?: DownloadLedger; budget?: DownloadBudget; clk?: ReturnType<typeof clock> } = {},
) {
  const net = fakeNetwork(handler);
  const events: string[] = [];
  const clk = opts.clk ?? clock();
  const ledger = opts.ledger ?? createMemoryLedger();
  const d = createPdfDownloader({
    fetchFn: net.fetchFn,
    ledger,
    budget: () => opts.budget ?? BUDGET,
    now: clk.now,
    log: (e) => {
      events.push(JSON.stringify(e));
      recordDownloadEvent(e, () => {});
    },
  });
  return { ...d, net, events, clk, ledger };
}

// ---------- OCR storage ----------

export const win = (start: number, end: number, total = 6, sha = HEX_A): { name: string; file: OcrWindowFile } => ({
  name: `w${start}-${end}-xyz.json`,
  file: { version: 1, totalPages: total, startPage: start, endPage: end, pages: Array.from({ length: end - start + 1 }, (_, i) => `text ${start + i}`), sourceSha256: sha, model: "m" },
});

export type FakeWindow = { name: string; file?: OcrWindowFile; raw?: string; status?: number; throws?: boolean };

/** Window files the fake store lists and serves. A window can be served corrupt (`raw`), with an HTTP status, or by failing the network. */
export function fakeOcrStorage(windows: FakeWindow[], opts: { listError?: Error; blockedFetch?: boolean } = {}) {
  const lists: string[] = [];
  const uploads: string[] = [];
  const storage: OcrStorage = {
    async list(prefix) {
      lists.push(prefix);
      if (opts.listError) throw opts.listError;
      return windows.map((w) => ({ pathname: `${prefix}${w.name}`, url: `https://store.example/${w.name}` }));
    },
    async upload({ pathname }) {
      uploads.push(pathname);
    },
    async delete() {},
  };
  const net = fakeNetwork((url) => {
    if (opts.blockedFetch) return blockedResponse();
    const w = windows.find((x) => url.endsWith(x.name));
    if (!w) return new Response("", { status: 404 });
    if (w.throws) throw new Error("socket hang up");
    if (w.status) return new Response("", { status: w.status });
    return new Response(w.raw ?? JSON.stringify(w.file), { status: 200 });
  });
  return { storage, lists, uploads, net };
}

export function fakeRenderer(pageCount: number): PageRenderer {
  return { pageCount, renderPng: async () => new Uint8Array(4), close() {} };
}

// ---------- a REAL, tiny PDF ----------

/** A valid one-page PDF containing `text`, built with correct cross-reference offsets. Real enough for pdf.js to open and read. */
export function tinyPdf(text = "Hello textbook chapter one"): Uint8Array {
  const content = `BT /F1 18 Tf 20 100 Td (${text}) Tj ET`;
  const bodies = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  bodies.forEach((b, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${b}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${bodies.length + 1}\n0000000000 65535 f \n`;
  for (const o of offsets) out += `${String(o).padStart(10, "0")} 00000 n \n`;
  out += `trailer\n<< /Size ${bodies.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(out);
}

// ---------- an OCR pass with every dependency faked ----------

/** Builds the dependencies of runOcrPass around fakes that record what was used (downloads, verifications, reads, saves, status writes). */
export function passHarness(over: Partial<OcrRunDeps> & { saved?: number[]; valid?: number[] | "same"; validTotal?: number | null; pdf?: PdfFetch; total?: number } = {}) {
  const saved = new Set(over.saved ?? []);
  const log = { pdf: 0, verifies: 0, reads: [] as number[], saves: [] as number[], statuses: [] as [number, number][], opened: 0 };
  const total = over.total ?? 6;
  const deps: OcrRunDeps = {
    knownTotalPages: null,
    getSavedPages: async () => new Set(saved),
    verifySaved: async () => {
      log.verifies++;
      const valid = over.valid === undefined || over.valid === "same" ? [...saved] : over.valid;
      return { validPages: new Set(valid), totalPages: over.validTotal === undefined ? total : over.validTotal };
    },
    saveWindow: async (w) => {
      log.saves.push(w.startPage);
      for (let p = w.startPage; p <= w.endPage; p++) saved.add(p);
    },
    getPdf: async () => (log.pdf++, over.pdf ?? { ok: true, bytes: new Uint8Array(2000), sha256: HEX_A, fromCache: false }),
    maxDirectBytes: 40 * MB,
    textLayerUsable: async () => false,
    openRenderer: async () => (log.opened++, fakeRenderer(total)),
    readWindow: async (images) => (log.reads.push(images[0].page), { pages: images.map((i) => `page ${i.page}`), model: "m" }),
    validate: () => ({ ok: true }),
    isQuotaFailure: () => false,
    recordStatus: async (d, t) => void log.statuses.push([d, t]),
    now: () => 0,
    startedAt: 0,
    callBudgetMs: 50_000,
    batchAllowanceMs: 30_000,
    parallelWindows: 3,
    ...over,
  };
  return { deps, log, saved };
}
