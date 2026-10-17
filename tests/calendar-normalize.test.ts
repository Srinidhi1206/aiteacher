// Offline tests for the rules that keep an extracted calendar honest before an administrator ever sees it (lib/calendar-import/normalize.ts and the text parser):
// what is flagged for review, what is collapsed, and that no date is ever made up. Pure: no database, network or AI.
import { test } from "node:test";
import assert from "node:assert/strict";

import { normalizeCandidates, eventKey, flagIncompleteExamPairs, flagProbableDuplicates } from "@/lib/calendar-import/normalize";
import { parseCalendarText } from "@/lib/calendar-import/parse-text";
import type { PreviewEvent, RawCandidate } from "@/lib/calendar-import/types";

const cand = (title: string, start: string | null, over: Partial<RawCandidate> = {}): RawCandidate => ({
  origin: "text",
  title,
  start,
  end: null,
  sourceText: `${start ?? ""} ${title}`,
  dateConfidence: "high",
  warnings: [],
  ...over,
});
const norm = (list: RawCandidate[]) => normalizeCandidates(list, { academicYear: "2026-27" });
const row = (id: string, title: string, startDate: string, over: Partial<PreviewEvent> = {}): PreviewEvent => ({ id, title, type: "EXAM", startDate, endDate: "", description: "", academicYear: "2026-27", confidence: "high", warnings: [], sourceText: "", ...over });

// ---- a clean row stays clean -------------------------------------------------------------------------------------------------------------------------------

test("a clearly dated, clearly typed row is high confidence with no warnings", () => {
  const [e] = norm([cand("Independence Day", "2026-08-15")]);
  assert.deepEqual([e.type, e.startDate, e.confidence, e.warnings], ["HOLIDAY", "2026-08-15", "high", []]);
});

test("an exam with both its Begins and Ends rows is not flagged on either row", () => {
  const events = norm([cand("Half-Yearly Examination Begins", "2026-11-20"), cand("Half-Yearly Examination Ends", "2026-11-24")]);
  assert.ok(events.every((e) => e.confidence === "high" && e.warnings.length === 0), JSON.stringify(events.map((e) => e.warnings)));
});

// ---- incomplete exam pairs ----------------------------------------------------------------------------------------------------------------------------------

test("an exam 'Begins' with no 'Ends' is flagged and keeps NO end date (none is invented)", () => {
  const [e] = norm([cand("Pre-Final Examination Begins", "2026-12-12")]);
  assert.equal(e.endDate, "");
  assert.equal(e.confidence, "review");
  assert.match(e.warnings.join(" "), /No matching "Pre-Final Examination Ends" row was found, so this exam is treated as a single day/);
});

test("an exam 'Ends' with no 'Begins' is flagged too", () => {
  const [e] = norm([cand("Annual Examination Ends", "2027-03-18")]);
  assert.equal(e.confidence, "review");
  assert.match(e.warnings.join(" "), /No matching "Annual Examination Begins" row/);
});

test("an exam that already carries its own end date is not flagged for a missing 'Ends' row", () => {
  const [e] = norm([cand("Half-Yearly Examination Begins", "2026-11-20", { end: "2026-11-24" })]);
  assert.equal(e.endDate, "2026-11-24");
  assert.ok(!e.warnings.some((w) => /No matching/.test(w)));
});

test("pairs are matched by name: 'Unit Test 1 Ends' does not complete 'Unit Test 2 Begins'", () => {
  const events = norm([cand("Unit Test 2 Begins", "2026-07-18"), cand("Unit Test 1 Ends", "2026-07-25")]);
  assert.ok(events.find((e) => e.title === "Unit Test 2 Begins")!.warnings.some((w) => /No matching/.test(w)));
  assert.ok(events.find((e) => e.title === "Unit Test 1 Ends")!.warnings.some((w) => /No matching/.test(w)));
});

test("an 'Ends' row more than a month after the 'Begins' does not complete it", () => {
  const events = norm([cand("Annual Examination Begins", "2027-01-01"), cand("Annual Examination Ends", "2027-03-18")]);
  assert.ok(events.every((e) => e.confidence === "review"));
});

test("holidays and other non-exam rows are never asked for an end row", () => {
  const events = norm([cand("School Reopens Begins", "2026-06-12"), cand("Christmas", "2026-12-25")]);
  assert.ok(events.every((e) => !e.warnings.some((w) => /No matching/.test(w))));
});

// ---- duplicates ----------------------------------------------------------------------------------------------------------------------------------------------------

test("the same event twice in one document is kept once and says so", () => {
  const events = norm([cand("Gandhi Jayanti", "2026-10-02"), cand("Gandhi Jayanti", "2026-10-02")]);
  assert.equal(events.length, 1);
  assert.match(events[0].warnings.join(" "), /more than once/);
});

test("two rows of the same kind, on the same day, saying much the same thing are BOTH flagged and BOTH kept", () => {
  const events = norm([cand("Half-Yearly Results", "2026-09-17"), cand("Results Declaration (Half-Yearly)", "2026-09-17")]);
  assert.equal(events.length, 2);
  for (const e of events) {
    assert.equal(e.confidence, "review");
    assert.match(e.warnings.join(" "), /Looks like the same event as/);
  }
});

test("different events that merely share a day are not flagged: a holiday and an exam, two unrelated titles, a one-word title", () => {
  const events = norm([cand("Independence Day", "2026-08-15"), cand("Unit Test 1 Begins", "2026-08-15"), cand("Sports Day", "2026-08-15"), cand("Annual Day", "2026-08-15")]);
  assert.ok(!events.some((e) => e.warnings.some((w) => /same event/.test(w))), JSON.stringify(events.map((e) => [e.title, e.warnings])));
  const same = norm([cand("Results", "2026-09-17"), cand("Results Declaration (Half-Yearly)", "2026-09-17")]);
  assert.ok(!same.some((e) => e.warnings.some((w) => /same event/.test(w))), "a single-word title is too vague to call a duplicate");
});

test("the same title on different days is two events", () => {
  assert.equal(norm([cand("School Holiday", "2026-07-03"), cand("School Holiday", "2026-11-26")]).length, 2);
});

test("duplicate detection is the one the importer uses when saving: the same words and day give the same key", () => {
  assert.equal(eventKey({ title: "Independence Day", startDate: "2026-08-15" }), eventKey({ title: "independence  day!", startDate: "2026-08-15" }));
  assert.notEqual(eventKey({ title: "Unit Test 1 Begins", startDate: "2026-11-01" }), eventKey({ title: "Unit Test 2 Begins", startDate: "2026-11-01" }));
});

// ---- ambiguity is never resolved by guessing ---------------------------------------------------------------------------------------------------------------

test("a row with no readable date stays undated and is flagged - the date is never guessed", () => {
  const [e] = norm([cand("Unit Test 3", null)]);
  assert.equal(e.startDate, "");
  assert.equal(e.confidence, "review");
  assert.match(e.warnings.join(" "), /No date was found/);
});

test("an end date before the start date is flagged", () => {
  const [e] = norm([cand("Winter Break", "2026-12-24", { end: "2026-12-20", type: "HOLIDAY" })]);
  assert.equal(e.confidence, "review");
  assert.match(e.warnings.join(" "), /end date is before the start date/);
});

test("a title that says nothing about its kind needs review and is typed OTHER, not guessed", () => {
  const [e] = norm([cand("Zorblax", "2026-09-01")]);
  assert.equal(e.type, "OTHER");
  assert.equal(e.confidence, "review");
});

test("the cross-row checks can be run on their own and are idempotent (running them twice adds no duplicate warnings)", () => {
  const rows = [row("a", "Quiz Begins", "2026-10-01"), row("b", "Half-Yearly Results", "2026-09-17", { type: "RESULT" }), row("c", "Results Declaration (Half-Yearly)", "2026-09-17", { type: "RESULT" })];
  for (let i = 0; i < 2; i++) {
    flagIncompleteExamPairs(rows);
    flagProbableDuplicates(rows);
  }
  assert.equal(rows[0].warnings.length, 1);
  assert.equal(rows[1].warnings.length, 1);
  assert.equal(rows[2].warnings.length, 1);
});

// ---- the text parser, end to end into the normaliser ------------------------------------------------------------------------------------------------------------

test("a typical text calendar becomes dated, typed rows - and the flags above appear on exactly the rows that need them", () => {
  const text = ["ACADEMIC CALENDAR 2026-27", "1 Nov 2026 - Unit Test 1 Begins", "6 Nov 2026 - Unit Test 1 Ends", "12 Nov 2026 - Diwali Holiday", "20 Nov 2026 - Half-Yearly Examination Begins"].join("\n");
  const parsed = parseCalendarText(text, { defaultYear: 2026 });
  const events = normalizeCandidates(parsed.candidates, { academicYear: parsed.academicYear });
  assert.equal(events.length, 4);
  assert.deepEqual(events.map((e) => [e.title, e.startDate, e.type, e.confidence]), [
    ["Unit Test 1 Begins", "2026-11-01", "EXAM", "high"],
    ["Unit Test 1 Ends", "2026-11-06", "EXAM", "high"],
    ["Diwali Holiday", "2026-11-12", "HOLIDAY", "high"],
    ["Half-Yearly Examination Begins", "2026-11-20", "EXAM", "review"],
  ]);
});
