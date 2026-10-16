// Offline tests for the OCR prompt and the page-marker parser (lib/rag/ocr.ts). Pure functions: no AI call, no storage, no database.
import { test } from "node:test";
import assert from "node:assert/strict";

import { assembleOcrPages, buildOcrPrompt, emptyPagesOf, inspectOcrResponse, parseOcrResponse, validateOcrWindow, type OcrWindowFile } from "@/lib/rag/ocr";

const P45 = "=====PAGE 45=====";
const P46 = "=====PAGE 46=====";
const TEXT_A = "यह पहले पृष्ठ का पाठ है और इसमें कई शब्द हैं जो ठीक से पढ़े जा सकते हैं।";
const TEXT_B = "यह दूसरे पृष्ठ का पाठ है।";

// ---------- the prompt always asks for every marker ----------

test("the prompt names every page's marker explicitly and no longer says to write nothing for an empty page", () => {
  const prompt = buildOcrPrompt([45, 46]);
  assert.ok(prompt.includes(P45) && prompt.includes(P46), "both marker lines are spelled out");
  assert.ok(/never leave a marker out/i.test(prompt));
  assert.ok(/still write that page's marker line/i.test(prompt));
  assert.ok(!/write nothing for that page\./i.test(prompt), "the old contradictory rule is gone");
  assert.ok(buildOcrPrompt([7]).includes("=====PAGE 7=====") && !buildOcrPrompt([7]).includes("=====PAGE 8====="));
});

// ---------- a marker with no content after it is a valid, empty page ----------

test("a page marker followed by empty content is a valid empty page (first, last, or both)", () => {
  assert.deepEqual(parseOcrResponse(`${P45}\n\n${P46}\n${TEXT_B}`, 45, 2), ["", TEXT_B]);
  assert.deepEqual(parseOcrResponse(`${P45}\n${TEXT_A}\n${P46}`, 45, 2), [TEXT_A, ""]);
  assert.deepEqual(parseOcrResponse(`${P45}\n${P46}\n`, 45, 2), ["", ""]);
});

test("a normal two-page answer still parses, text is trimmed and NFC-normalised", () => {
  assert.deepEqual(parseOcrResponse(`${P45}\n  ${TEXT_A}  \n\n${P46}\n${TEXT_B}\n`, 45, 2), [TEXT_A, TEXT_B]);
  assert.deepEqual(parseOcrResponse(`=====PAGE 9=====\ncafé`, 9, 1), ["café"]);
});

// ---------- harmless formatting is accepted, without changing which page a marker names ----------

test("harmless marker formatting is accepted: spaces, bold / italic / backticks, any case, Windows line endings, a wrapping code fence", () => {
  const variants = [
    `  ${P45}  \n${TEXT_A}\n   ${P46}   \n${TEXT_B}`,
    `**${P45}**\n${TEXT_A}\n**${P46}**\n${TEXT_B}`,
    `\`${P45}\`\n${TEXT_A}\n_${P46}_\n${TEXT_B}`,
    `===== PAGE 45 =====\n${TEXT_A}\n=====  page   46  =====\n${TEXT_B}`,
    `=====page 45=====\n${TEXT_A}\n=====Page 46=====\n${TEXT_B}`,
    `${P45}\r\n${TEXT_A}\r\n${P46}\r\n${TEXT_B}\r\n`,
    `\`\`\`\n${P45}\n${TEXT_A}\n${P46}\n${TEXT_B}\n\`\`\``,
  ];
  for (const v of variants) assert.deepEqual(parseOcrResponse(v, 45, 2), [TEXT_A, TEXT_B], JSON.stringify(v).slice(0, 60));
});

// ---------- anything that could confuse page numbers is rejected ----------

test("missing, duplicate, out-of-order, extra and wrongly-numbered markers are all rejected", () => {
  assert.equal(parseOcrResponse(`${P45}\n${TEXT_A}`, 45, 2), null, "missing marker");
  assert.equal(parseOcrResponse(`${TEXT_A}\n${P46}\n${TEXT_B}`, 45, 2), null, "first marker missing");
  assert.equal(parseOcrResponse(`${P45}\n${TEXT_A}\n${P45}\n${TEXT_B}`, 45, 2), null, "duplicate marker");
  assert.equal(parseOcrResponse(`${P46}\n${TEXT_B}\n${P45}\n${TEXT_A}`, 45, 2), null, "out of order");
  assert.equal(parseOcrResponse(`${P45}\n${TEXT_A}\n${P46}\n${TEXT_B}\n=====PAGE 47=====\nx`, 45, 2), null, "extra marker");
  assert.equal(parseOcrResponse(`=====PAGE 46=====\n${TEXT_A}\n=====PAGE 47=====\n${TEXT_B}`, 45, 2), null, "wrong start page");
  assert.equal(parseOcrResponse("", 45, 2), null);
  assert.equal(parseOcrResponse("I cannot read these pages.", 45, 2), null);
});

test("lookalikes are NOT markers: other '=' counts, no number, or a marker mid-line / mentioned inside the text", () => {
  assert.equal(parseOcrResponse(`====PAGE 45====\n${TEXT_A}\n====PAGE 46====\n${TEXT_B}`, 45, 2), null, "four '='");
  assert.equal(parseOcrResponse(`======PAGE 45======\n${TEXT_A}\n======PAGE 46======\n${TEXT_B}`, 45, 2), null, "six '='");
  assert.equal(parseOcrResponse(`=====PAGE=====\n${TEXT_A}\n=====PAGE=====\n${TEXT_B}`, 45, 2), null, "no number");
  // The text mentions a marker mid-line and a page number: neither adds a marker, so the real count is still short.
  assert.equal(parseOcrResponse(`${P45}\nsee ${P46} here and Page 46 below`, 45, 2), null);
  // ...and when both real markers are present, such mentions are just content.
  assert.deepEqual(parseOcrResponse(`${P45}\nsee ${P46} here\n${P46}\nPage 45 of 90`, 45, 2), [`see ${P46} here`, "Page 45 of 90"]);
});

test("inspectOcrResponse reports counts and the kind of problem - numbers only, never text", () => {
  assert.deepEqual(inspectOcrResponse(`${P45}\n${TEXT_A}\n${P46}\n${TEXT_B}`, 45, 2), { found: 2, expected: 2, problem: "none" });
  assert.deepEqual(inspectOcrResponse(`${P45}\n${TEXT_A}`, 45, 2), { found: 1, expected: 2, problem: "missing" });
  assert.deepEqual(inspectOcrResponse(`${P45}\nx\n${P46}\ny\n=====PAGE 47=====`, 45, 2), { found: 3, expected: 2, problem: "extra" });
  assert.deepEqual(inspectOcrResponse(`${P46}\nx\n${P45}\ny`, 45, 2), { found: 2, expected: 2, problem: "order" });
  assert.deepEqual(inspectOcrResponse(`${P45}\nx\n${P45}\ny`, 45, 2), { found: 2, expected: 2, problem: "order" });
  assert.deepEqual(inspectOcrResponse("no markers", 45, 2), { found: 0, expected: 2, problem: "missing" });
});

// ---------- an empty page does not stop the window from being accepted ----------

test("a window with one empty page and one real page passes validation (it can be saved)", () => {
  const pages = parseOcrResponse(`${P45}\n${P46}\n${TEXT_A.repeat(3)}`, 45, 2);
  assert.ok(pages);
  assert.deepEqual(pages![0], "");
  assert.deepEqual(validateOcrWindow(pages!, "devanagari"), { ok: true });
});

// ---------- assembling saved windows: an empty page never shadows text ----------

const SHA = "a".repeat(64);
const win = (startPage: number, pages: string[], totalPages = 6, sourceSha256 = SHA): OcrWindowFile => ({
  version: 1,
  totalPages,
  startPage,
  endPage: startPage + pages.length - 1,
  pages,
  sourceSha256,
  model: "m",
});

test("overlapping windows: the preferred window's EMPTY page does not shadow text another window has for that page (both priority orders)", () => {
  // Priority is earliest start, then widest. Here the wide window [2-3] outranks the single [3-3] for page 3.
  const wideEmpty = win(2, ["page two", ""]);
  const singleText = win(3, ["page three text"]);
  const a = assembleOcrPages([wideEmpty, singleText, win(1, ["page one"]), win(4, ["p4", "p5", "p6"])]);
  assert.equal(a.pages[2], "page three text", "text from the lower-priority window wins over an empty page");
  assert.ok(a.complete && a.missing === 0);

  // And the other way round: the preferred (wide) window has the text, the lower-priority single window is empty.
  const wideText = win(2, ["page two", "page three text"]);
  const singleEmpty = win(3, [""]);
  const b = assembleOcrPages([singleEmpty, wideText, win(1, ["page one"]), win(4, ["p4", "p5", "p6"])]);
  assert.equal(b.pages[2], "page three text", "text is never replaced by an empty page");

  // The order the windows are passed in makes no difference.
  const forward = assembleOcrPages([wideEmpty, singleText, win(1, ["x"]), win(4, ["a", "b", "c"])]);
  const backward = assembleOcrPages([win(4, ["a", "b", "c"]), win(1, ["x"]), singleText, wideEmpty]);
  assert.deepEqual(forward.pages, backward.pages);
});

test("whitespace-only text counts as empty for that rule, and a non-empty page is never replaced by a different non-empty one", () => {
  const a = assembleOcrPages([win(1, ["   \n"], 1), win(1, ["real text"], 1)]);
  assert.equal(a.pages[0], "real text");
  // Existing priority between two NON-empty readings is unchanged: earliest start, then the wider window (here the two-page one).
  const wider = assembleOcrPages([win(1, ["narrow reading"], 2), win(1, ["wide reading", "x"], 2)]);
  assert.equal(wider.pages[0], "wide reading");
  const sameWidth = assembleOcrPages([win(1, ["first of two"], 1), win(1, ["second of two"], 1)]);
  assert.equal(sameWidth.pages[0], "first of two", "equal priority: the first one given keeps the page, a later non-empty one does not replace it");
});

test("pages that are genuinely missing stay missing; pages that are empty everywhere count as covered (and stay empty)", () => {
  const missing = assembleOcrPages([win(1, ["one", "two"]), win(5, ["five", "six"])]); // pages 3-4 absent
  assert.equal(missing.missing, 2);
  assert.ok(!missing.complete);
  assert.deepEqual(missing.pages, ["one", "two", "", "", "five", "six"]);

  const blank = assembleOcrPages([win(1, ["one", ""]), win(3, ["", ""]), win(5, ["five", "six"])]);
  assert.ok(blank.complete && blank.missing === 0, "empty pages are covered, not missing");
  assert.deepEqual(blank.pages, ["one", "", "", "", "five", "six"]);
});

test("windows of a different book or page count are still ignored, however good their text", () => {
  const other = win(1, ["wrong book text"], 6, "b".repeat(64));
  const wrongTotal = win(1, ["another count"], 9);
  const r = assembleOcrPages([win(1, ["", ""]), other, wrongTotal, win(3, ["t3", "t4"]), win(5, ["t5", "t6"])]);
  assert.equal(r.pages[0], "", "text from another file never fills a page");
  assert.ok(r.complete);
});

test("emptyPagesOf lists only the page numbers whose text is empty or whitespace", () => {
  assert.deepEqual(emptyPagesOf(win(45, ["text", ""])), [46]);
  assert.deepEqual(emptyPagesOf(win(45, ["", "  \n "])), [45, 46]);
  assert.deepEqual(emptyPagesOf(win(45, ["a", "b"])), []);
});
