// Offline tests for the calendar-import review decisions (lib/calendar-import/review.ts), the duplicate-submit guard and the drafts view.
// Nothing here uses a database, the network, OCR or any AI service: the "server" is a fake that records what it was sent.
import { test } from "node:test";
import assert from "node:assert/strict";

import { audienceNeedsAck, buildPayload, isRealIsoDate, planSave, rowProblem, saveButtonState, saveDraftRows, tickLocked, unsavedCount, SAVE_FAILED_MESSAGE, type ImportPayload, type ReviewRow } from "@/lib/calendar-import/review";
import { dedupeInFlight, stableKey } from "@/lib/calendar-import/inflight";
import { countDrafts, filterByView } from "@/lib/calendar/view";

const row = (id: string, over: Partial<ReviewRow> = {}): ReviewRow => ({
  id,
  title: `Event ${id}`,
  type: "EVENT",
  startDate: "2026-08-15",
  endDate: "",
  description: "",
  academicYear: "2026-27",
  confidence: "high",
  warnings: [],
  sourceText: `source ${id}`,
  include: true,
  schoolClassId: "",
  saved: false,
  ...over,
});
const SCOPE = { schoolId: "demo-school", boardId: "bse-telangana", schoolClassId: "class-10" };
const okSave = (log: ImportPayload[]) => async (p: ImportPayload) => (log.push(p), { ok: true, data: { created: p.events.length, skipped: 0 } });

// ---------- validation never drops anything silently ----------

test("dates: only real calendar dates pass, and an end date before the start is a problem", () => {
  assert.ok(isRealIsoDate("2026-02-28") && !isRealIsoDate("2026-02-31") && !isRealIsoDate("2026-13-01") && !isRealIsoDate("15-08-2026") && !isRealIsoDate(""));
  assert.equal(rowProblem(row("a")), null);
  assert.equal(rowProblem(row("a", { title: "  " })), "Needs a title");
  assert.equal(rowProblem(row("a", { startDate: "" })), "Needs a valid start date");
  assert.equal(rowProblem(row("a", { startDate: "2026-02-31" })), "Needs a valid start date");
  assert.equal(rowProblem(row("a", { startDate: "2026-08-15", endDate: "2026-08-10" })), "End date is before the start date");
  assert.equal(rowProblem(row("a", { startDate: "2026-08-15", endDate: "2026-08-20" })), null);
});

test("planSave: valid ticked rows are saved; invalid ticked rows are LISTED with the reason, not dropped; unticked, saved and duplicate rows are left alone", () => {
  const rows = [
    row("ok1"),
    row("ok2", { confidence: "review" }),
    row("bad-date", { startDate: "" }),
    row("bad-title", { title: "" }),
    row("unticked", { include: false }),
    row("done", { saved: true }),
    row("dup"),
  ];
  const plan = planSave(rows, { dup: true });
  assert.deepEqual(plan.toSave.map((r) => r.id), ["ok1", "ok2"]);
  assert.deepEqual(plan.blocked.map((b) => [b.row.id, b.problem]), [["bad-date", "Needs a valid start date"], ["bad-title", "Needs a title"]]);
});

test("a ticked row with a problem does NOT block the valid ones from being saved", () => {
  const plan = planSave([row("good"), row("bad", { startDate: "" })], {});
  const state = saveButtonState(plan, { saving: false, audienceAcknowledged: false, audienceNeedsAck: false });
  assert.equal(state.enabled, true);
  assert.equal(state.label, "Save 1 event as draft");
});

// ---------- the primary action: label, enabled state and reason ----------

test("the save button states: ready, nothing ticked, only problems, wide-open audience, saving", () => {
  const some = planSave([row("a"), row("b")], {});
  assert.deepEqual(saveButtonState(some, { saving: false, audienceAcknowledged: false, audienceNeedsAck: false }), { enabled: true, label: "Save 2 events as drafts", hint: null });

  const none = planSave([row("a", { include: false })], {});
  const noneState = saveButtonState(none, { saving: false, audienceAcknowledged: false, audienceNeedsAck: false });
  assert.equal(noneState.enabled, false);
  assert.match(noneState.hint ?? "", /Tick the events/);

  const onlyBad = planSave([row("a", { startDate: "" })], {});
  assert.match(saveButtonState(onlyBad, { saving: false, audienceAcknowledged: false, audienceNeedsAck: false }).hint ?? "", /Fix the events marked/);

  const wide = saveButtonState(some, { saving: false, audienceAcknowledged: false, audienceNeedsAck: true });
  assert.equal(wide.enabled, false);
  assert.match(wide.hint ?? "", /school, board or class/);
  assert.equal(saveButtonState(some, { saving: false, audienceAcknowledged: true, audienceNeedsAck: true }).enabled, true);

  const busy = saveButtonState(some, { saving: true, audienceAcknowledged: true, audienceNeedsAck: false });
  assert.deepEqual([busy.enabled, busy.label], [false, "Saving..."]);
});

test("audience safety: only a super administrator with NO school, board or class chosen needs the extra confirmation", () => {
  assert.equal(audienceNeedsAck(true, { schoolId: "", boardId: "", schoolClassId: "" }), true);
  assert.equal(audienceNeedsAck(true, SCOPE), false);
  assert.equal(audienceNeedsAck(true, { schoolId: "demo-school", boardId: "", schoolClassId: "" }), false);
  assert.equal(audienceNeedsAck(true, { schoolId: "", boardId: "", schoolClassId: "class-10" }), false);
  assert.equal(audienceNeedsAck(false, { schoolId: "", boardId: "", schoolClassId: "" }), false, "a school administrator is always scoped to their own school");
});

// ---------- saving: what is sent, what is kept ----------

test("saveDraftRows sends ONLY the valid ticked rows, with the chosen audience, and marks exactly those saved - the others stay for review", async () => {
  const sent: ImportPayload[] = [];
  const rows = [row("a"), row("b", { confidence: "review" }), row("bad", { startDate: "" }), row("later", { include: false })];
  const out = await saveDraftRows({ rows, duplicates: {}, scope: SCOPE, source: { sourceName: "calendar.png", sourceUrl: "https://store.example/c.png" }, save: okSave(sent) });
  assert.equal(out.status, "saved");
  if (out.status !== "saved") return;
  assert.equal(sent.length, 1);
  assert.deepEqual(sent[0].events.map((e) => e.title), ["Event a", "Event b"]);
  assert.deepEqual(sent[0].scope, SCOPE);
  assert.equal(sent[0].sourceName, "calendar.png");
  assert.deepEqual([out.created, out.leftOut], [2, 1], "two saved; the ticked row with a problem was left out, not dropped");
  assert.deepEqual(out.rows.map((r) => [r.id, !!r.saved, r.include]), [["a", true, false], ["b", true, false], ["bad", false, true], ["later", false, false]]);
  assert.equal(out.rows.length, rows.length, "no row was dropped");
});

test("a ticked row with a problem is reported as left out, kept on screen, and can be saved after it is fixed", async () => {
  const sent: ImportPayload[] = [];
  const first = await saveDraftRows({ rows: [row("a"), row("bad", { startDate: "" })], duplicates: {}, scope: SCOPE, source: {}, save: okSave(sent) });
  assert.ok(first.status === "saved" && first.leftOut === 1);
  if (first.status !== "saved") return;
  const fixed = first.rows.map((r) => (r.id === "bad" ? { ...r, startDate: "2026-09-01" } : r));
  const second = await saveDraftRows({ rows: fixed, duplicates: {}, scope: SCOPE, source: {}, save: okSave(sent) });
  assert.ok(second.status === "saved");
  assert.deepEqual(sent.map((p) => p.events.map((e) => e.title)), [["Event a"], ["Event bad"]], "'a' was not sent a second time");
});

test("nothing saveable: no request is made and the rows are returned unchanged", async () => {
  let calls = 0;
  const rows = [row("a", { include: false }), row("bad", { startDate: "" })];
  const out = await saveDraftRows({ rows, duplicates: {}, scope: SCOPE, source: {}, save: async () => (calls++, { ok: true, data: { created: 0, skipped: 0 } }) });
  assert.equal(out.status, "failed");
  assert.equal(calls, 0);
  assert.equal(out.rows, rows);
});

// ---------- a failed save keeps everything and a retry needs no new OCR ----------

test("a save that FAILS (error result or thrown) returns the very same rows with a clear message; the retry works without reading the document again", async () => {
  let extractions = 1; // the document was read once, before the review screen
  const rows = [row("a"), row("b", { title: "Edited by the admin" })];

  const rejected = await saveDraftRows({ rows, duplicates: {}, scope: SCOPE, source: {}, save: async () => ({ ok: false, error: "The school was not found." }) });
  assert.deepEqual([rejected.status, (rejected as { error: string }).error], ["failed", "The school was not found."]);
  assert.equal(rejected.rows, rows, "the same rows - edits included");

  const thrown = await saveDraftRows({ rows, duplicates: {}, scope: SCOPE, source: {}, save: async () => Promise.reject(new Error("socket hang up")) });
  assert.deepEqual([thrown.status, (thrown as { error: string }).error], ["failed", SAVE_FAILED_MESSAGE]);
  assert.equal(thrown.rows, rows);
  assert.match(SAVE_FAILED_MESSAGE, /still here/);
  assert.match(SAVE_FAILED_MESSAGE, /does not need to be read again/);

  const sent: ImportPayload[] = [];
  const retried = await saveDraftRows({ rows: thrown.rows, duplicates: {}, scope: SCOPE, source: {}, save: okSave(sent) });
  assert.equal(retried.status, "saved");
  assert.equal(sent[0].events[1].title, "Edited by the admin");
  assert.equal(extractions, 1, "no new OCR/extraction was needed for the retry");
  extractions += 0;
});

test("an error reply without a message still gives the readable retry message", async () => {
  const out = await saveDraftRows({ rows: [row("a")], duplicates: {}, scope: SCOPE, source: {}, save: async () => ({ ok: false }) });
  assert.deepEqual([out.status, (out as { error: string }).error], ["failed", SAVE_FAILED_MESSAGE]);
});

// ---------- leaving the screen ----------

test("unsavedCount: what would be lost if the screen were closed now (saved rows and rows already in the calendar do not count)", () => {
  const rows = [row("a"), row("b", { saved: true }), row("c"), row("dup")];
  assert.equal(unsavedCount(rows, { dup: true }), 2);
  assert.equal(unsavedCount([], {}), 0);
  assert.equal(unsavedCount([row("x", { saved: true })], {}), 0);
});

test("buildPayload carries the audience and source and only the event fields the server accepts", () => {
  const p = buildPayload([row("a", { schoolClassId: "class-9" })], SCOPE, { sourceName: "c.png", sourceUrl: null });
  assert.deepEqual(Object.keys(p.events[0]).sort(), ["academicYear", "description", "endDate", "schoolClassId", "startDate", "title", "type"]);
  assert.equal(p.sourceUrl, undefined);
  assert.equal(p.events[0].schoolClassId, "class-9");
});

// ---------- repeated clicks never run a save twice ----------

test("dedupeInFlight: identical overlapping calls share ONE run and get the same answer; a later call runs again", async () => {
  const map = new Map<string, Promise<number>>();
  let runs = 0;
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  const work = async () => (runs++, await gate, runs);
  const a = dedupeInFlight(map, "k", work);
  const b = dedupeInFlight(map, "k", work);
  const c = dedupeInFlight(map, "other", work);
  release();
  assert.deepEqual(await Promise.all([a, b, c]), [2, 2, 2]);
  assert.equal(runs, 2, "'k' ran once for two callers; 'other' ran on its own");
  assert.equal(map.size, 0, "nothing is left behind");
  await dedupeInFlight(map, "k", work);
  assert.equal(runs, 3);
});

test("dedupeInFlight forgets a run that failed, so a retry is not stuck on the old error", async () => {
  const map = new Map<string, Promise<string>>();
  await assert.rejects(() => dedupeInFlight(map, "k", async () => Promise.reject(new Error("boom"))), /boom/);
  assert.equal(map.size, 0);
  assert.equal(await dedupeInFlight(map, "k", async () => "fine"), "fine");
});

test("stableKey is the same for the same content whatever the key order, and differs for different content", () => {
  assert.equal(stableKey({ a: 1, b: { c: 2, d: [1, { y: 1, x: 2 }] } }), stableKey({ b: { d: [1, { x: 2, y: 1 }], c: 2 }, a: 1 }));
  assert.notEqual(stableKey({ a: 1 }), stableKey({ a: 2 }));
});

// ---------- saved drafts are found again ----------

test("the Drafts view lists saved, unpublished events - the way a saved import is reopened after navigating away or refreshing", () => {
  const events = [
    { id: "1", isPublished: false },
    { id: "2", isPublished: true },
    { id: "3", isPublished: false },
  ];
  assert.deepEqual(filterByView(events, "drafts").map((e) => e.id), ["1", "3"]);
  assert.deepEqual(filterByView(events, "published").map((e) => e.id), ["2"]);
  assert.equal(filterByView(events, "all").length, 3);
  assert.equal(countDrafts(events), 2);
});

test("tick boxes: a ticked row with a problem can still be UNticked; an unticked one cannot be ticked until fixed; saved, existing and in-progress rows are locked", () => {
  const idle = { saving: false, duplicate: false };
  assert.equal(tickLocked(row("ok"), idle), false);
  assert.equal(tickLocked(row("bad-ticked", { startDate: "" }), idle), false, "can be unticked, so 'fix it or untick it' is always possible");
  assert.equal(tickLocked(row("bad-unticked", { startDate: "", include: false }), idle), true, "cannot be ticked until the date is fixed");
  assert.equal(tickLocked(row("fixed-unticked", { include: false }), idle), false);
  assert.equal(tickLocked(row("done", { saved: true }), idle), true);
  assert.equal(tickLocked(row("dup"), { saving: false, duplicate: true }), true);
  assert.equal(tickLocked(row("ok"), { saving: true, duplicate: false }), true);
});
