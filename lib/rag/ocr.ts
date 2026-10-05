// OCR for textbooks whose PDF text layer cannot be used (a legacy font encoding that extracts as gibberish, a scanned book, or a
// file too big to read in one go): each page is rendered to an image and read by the AI reader, a couple of pages at a time, and
// every window's text is saved on its own so the work can stop and resume anywhere. This file is the pure part - planning the
// windows, asking for a format that can be checked, parsing the answer and refusing anything that does not look like the
// book's own language - so it can be tested without any AI call. Nothing here touches the database.
import { assessTextLayer } from "@/lib/rag/text-quality";

/** Pages read per AI call. One: a slow or refused call then costs a single page, and every page is saved the moment it is read. */
export const OCR_WINDOW_PAGES = 1;

export interface OcrWindowFile {
  version: 1;
  /** Total pages in the source PDF when this window was read. */
  totalPages: number;
  startPage: number;
  endPage: number;
  /** One entry per page, startPage..endPage ("" for a page with no printed text). */
  pages: string[];
  /** SHA-256 of the source PDF - ties the text to that exact file. */
  sourceSha256: string;
  model: string | null;
}

export function planWindows(totalPages: number): { start: number; end: number }[] {
  const out: { start: number; end: number }[] = [];
  for (let start = 1; start <= totalPages; start += OCR_WINDOW_PAGES) out.push({ start, end: Math.min(totalPages, start + OCR_WINDOW_PAGES - 1) });
  return out;
}

export type Script = "devanagari" | "telugu";

/** The script a subject's textbook is written in, when that is known from the subject's name. */
export function expectedScriptForSubject(subjectName: string): Script | null {
  const n = subjectName.toLowerCase();
  if (/\b(hindi|sanskrit|marathi)\b/.test(n)) return "devanagari";
  if (/\btelugu\b/.test(n)) return "telugu";
  return null;
}

const SCRIPT_RANGE: Record<Script, RegExp> = { devanagari: /[ऀ-ॿ]/gu, telugu: /[ఀ-౿]/gu };
const LETTERS = /[\p{L}\p{M}]/gu;

export function buildOcrPrompt(pageNumbers: number[]): string {
  return `You are an OCR engine. The images that follow are consecutive pages of a printed school textbook, in this order: page ${pageNumbers.join(", page ")}.

For EACH page, transcribe all of its printed text exactly as it appears, in the original language and script.
Rules - follow them exactly:
1. Copy only what is printed. Do not translate, transliterate, summarise, explain, correct spelling or grammar, or add anything.
2. Keep the reading order: headings, paragraphs, lists, questions and exercises. Keep numbers, punctuation, and mathematical or chemical notation as printed.
3. Ignore the diagonal "SCERT TELANGANA" watermark, decorative borders and page ornaments, and leave out the running page number and the "free distribution" line at the top or bottom of the page. Do not describe pictures or diagrams; keep only text that is printed in them (captions, labels).
4. If a page has no printed text, write nothing for that page.
5. Output format: for each page, a line exactly like =====PAGE ${pageNumbers[0]}===== (using that page's number) followed by that page's text. Output nothing else - no introduction, no notes, no code fences.`;
}

/** Splits the reader's answer into one text per requested page; null unless every requested page is present, in order. */
export function parseOcrResponse(text: string, startPage: number, count: number): string[] | null {
  const cleaned = text.replace(/^\s*```[a-z]*\s*/i, "").replace(/\s*```\s*$/, "");
  const marker = /^=====PAGE (\d+)=====[ \t]*$/gm;
  const marks: { page: number; at: number; end: number }[] = [];
  for (let m = marker.exec(cleaned); m; m = marker.exec(cleaned)) marks.push({ page: Number(m[1]), at: m.index, end: m.index + m[0].length });
  if (marks.length !== count) return null;
  const pages: string[] = [];
  for (let i = 0; i < marks.length; i++) {
    if (marks[i].page !== startPage + i) return null;
    pages.push(cleaned.slice(marks[i].end, i + 1 < marks.length ? marks[i + 1].at : cleaned.length).normalize("NFC").trim());
  }
  return pages;
}

const REFUSAL = /^(i('m| am)? (sorry|unable|not able)|i cannot|i can't|sorry,|as an ai)/i;

/**
 * Decides whether a window's text can be trusted enough to store. It does not prove the text is right - the administrator can
 * always compare it with the page - but it refuses the failures that are detectable: a refusal or commentary instead of text,
 * text that is not in the book's script, and symbol soup like the legacy text layer itself.
 */
export function validateOcrWindow(pages: string[], script: Script | null): { ok: true } | { ok: false; reason: string } {
  const joined = pages.join("\n");
  if (REFUSAL.test(joined.trim())) return { ok: false, reason: "The reader answered with a refusal instead of the page text." };
  if (!assessTextLayer([joined]).readable) return { ok: false, reason: "The text came back as symbols, not words." };
  if (script) {
    const letters = joined.match(LETTERS)?.length ?? 0;
    if (letters >= 60) {
      const inScript = joined.match(SCRIPT_RANGE[script])?.length ?? 0;
      if (inScript / letters < 0.6) return { ok: false, reason: `Most of the text is not in the book's script (${script}).` };
    }
  }
  return { ok: true };
}

/** Puts the saved windows back together. `complete` only when every page 1..totalPages is covered exactly once. */
export function assembleOcrPages(windows: OcrWindowFile[]): { pages: string[]; totalPages: number; complete: boolean; sourceSha256: string | null; missing: number } {
  if (windows.length === 0) return { pages: [], totalPages: 0, complete: false, sourceSha256: null, missing: 0 };
  const totalPages = windows[0].totalPages;
  const sha = windows[0].sourceSha256;
  const pages: (string | null)[] = new Array(totalPages).fill(null);
  for (const w of windows) {
    if (w.totalPages !== totalPages || w.sourceSha256 !== sha) continue; // a leftover from a different file is ignored
    for (let i = 0; i < w.pages.length; i++) {
      const at = w.startPage - 1 + i;
      if (at >= 0 && at < totalPages && pages[at] === null) pages[at] = w.pages[i];
    }
  }
  const missing = pages.filter((p) => p === null).length;
  return { pages: pages.map((p) => p ?? ""), totalPages, complete: missing === 0, sourceSha256: sha, missing };
}
