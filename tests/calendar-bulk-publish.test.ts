// Offline tests for publishing a whole imported calendar at once (lib/calendar/core.ts: publishManyAcademicEventsCore + calendarPublishDigests): who may do it, that only
// drafts change, that it is safe to repeat, that nothing is created or deleted, and that each audience gets ONE notification. In-memory database; no network.
import { test } from "node:test";
import assert from "node:assert/strict";

import { publishManyAcademicEventsCore, calendarPublishDigests, setAcademicEventPublishedCore, type CalendarActor, type CalendarDb, type PublishedEventInfo } from "@/lib/calendar/core";
import { studentAcademicEventWhere } from "@/lib/calendar/scope";
import { matches } from "./fake-where";
import { makeWorld, type EventRow } from "./fake-world";

const SUPER: CalendarActor = { userId: "super", isSuperAdmin: true, schoolId: null };
const DEMO: CalendarActor = { userId: "demo-admin", isSuperAdmin: false, schoolId: "demo" };
const OTHER: CalendarActor = { userId: "other-admin", isSuperAdmin: false, schoolId: "other" };

function setup() {
  const w = makeWorld({ clock: new Date("2026-10-20T05:00:00Z") });
  const add = (id: string, title: string, over: Partial<EventRow> = {}) =>
    w.events.push({ id, title, type: "EXAM", startDate: new Date("2026-11-01T00:00:00Z"), endDate: null, description: null, academicYear: "2026-27", isPublished: false, schoolId: "demo", boardId: "bse", schoolClassId: "c10", createdByUserId: "x", ...over });
  add("a", "Unit Test 1 Begins");
  add("b", "Unit Test 1 Ends", { startDate: new Date("2026-11-06T00:00:00Z") });
  add("c", "Diwali Holiday", { type: "HOLIDAY", startDate: new Date("2026-11-12T00:00:00Z") });
  add("d", "Other School Event", { schoolId: "other", boardId: "bse", schoolClassId: "c10" });
  add("e", "Already Live", { isPublished: true, startDate: new Date("2026-12-01T00:00:00Z") });
  return { w, db: w.db as CalendarDb };
}
const published = (w: ReturnType<typeof setup>["w"]) => w.events.filter((e) => e.isPublished).map((e) => e.id).sort();

test("the owning school's administrator publishes the chosen drafts in one step; events already live and other schools' events are not touched", async () => {
  const { w, db } = setup();
  const res = await publishManyAcademicEventsCore(db, DEMO, ["a", "b", "c", "d", "e"]);
  assert.equal(res.ok, true);
  assert.deepEqual([res.data!.published, res.data!.skipped], [3, 2], "d is another school's, e is already published");
  assert.deepEqual(published(w), ["a", "b", "c", "e"]);
  assert.equal(w.events.find((e) => e.id === "d")!.isPublished, false, "another school's draft is untouched");
  assert.deepEqual(res.data!.events.map((e) => e.id).sort(), ["a", "b", "c"]);
});

test("the super administrator may publish any school's drafts", async () => {
  const { w, db } = setup();
  const res = await publishManyAcademicEventsCore(db, SUPER, ["a", "d"]);
  assert.equal(res.data!.published, 2);
  assert.deepEqual(published(w), ["a", "d", "e"]);
});

test("another school's administrator publishes nothing, learns nothing (the answer is the same as for missing ids), and leaves no audit entry", async () => {
  const { w, db } = setup();
  const res = await publishManyAcademicEventsCore(db, OTHER, ["a", "b", "c", "no-such-id"]);
  assert.deepEqual([res.ok, res.data!.published, res.data!.skipped], [true, 0, 4]);
  assert.deepEqual(published(w), ["e"]);
  assert.equal(w.audit.length, 0);
});

test("it is safe to repeat: the second call publishes nothing and changes nothing", async () => {
  const { w, db } = setup();
  await publishManyAcademicEventsCore(db, DEMO, ["a", "b", "c"]);
  const writes = w.calls.eventUpdates;
  const again = await publishManyAcademicEventsCore(db, DEMO, ["a", "b", "c"]);
  assert.deepEqual([again.data!.published, again.data!.skipped], [0, 3]);
  assert.equal(w.calls.eventUpdates, writes, "no write on the repeat");
  assert.equal(w.audit.length, 1, "one audit entry in total");
});

test("it only publishes: nothing is created or deleted, titles/dates/audience are unchanged, and ONE audit entry names how many", async () => {
  const { w, db } = setup();
  const before = w.events.map((e) => ({ ...e, isPublished: undefined }));
  await publishManyAcademicEventsCore(db, DEMO, ["a", "b", "c"]);
  assert.deepEqual(w.events.map((e) => ({ ...e, isPublished: undefined })), before);
  assert.equal(w.calls.eventCreates, 0);
  assert.equal(w.audit.length, 1);
  assert.equal(w.audit[0].resource, "AcademicEventPublish");
  assert.match(w.audit[0].message, /published together: 3/);
});

test("bad input is refused before anything is read or written: no ids, too many ids, blank ids", async () => {
  const { w, db } = setup();
  for (const bad of [[], undefined, "a", [""], Array.from({ length: 201 }, (_, i) => `id${i}`)]) {
    const res = await publishManyAcademicEventsCore(db, DEMO, bad);
    assert.equal(res.ok, false, String(JSON.stringify(bad)).slice(0, 30));
  }
  assert.deepEqual(published(w), ["e"]);
  assert.equal(w.audit.length, 0);
});

test("duplicate ids in the request are counted once", async () => {
  const { db } = setup();
  const res = await publishManyAcademicEventsCore(db, DEMO, ["a", "a", "a"]);
  assert.deepEqual([res.data!.published, res.data!.skipped], [1, 0]);
});

test("drafts are invisible to a student before this, and visible only to the intended audience after it (the student rule, run on the same rows)", async () => {
  const { w, db } = setup();
  const visibleTo = (s: { schoolId: string; boardId: string; schoolClassId: string }) => w.events.filter((e) => matches(e as never, studentAcademicEventWhere(s) as never)).map((e) => e.id).sort();
  const demo10 = { schoolId: "demo", boardId: "bse", schoolClassId: "c10" };
  const demo9 = { schoolId: "demo", boardId: "bse", schoolClassId: "c9" };
  const other10 = { schoolId: "other", boardId: "bse", schoolClassId: "c10" };
  assert.deepEqual(visibleTo(demo10), ["e"], "only the already-published event");
  await publishManyAcademicEventsCore(db, SUPER, ["a", "b", "c", "d"]);
  assert.deepEqual(visibleTo(demo10), ["a", "b", "c", "e"]);
  assert.deepEqual(visibleTo(demo9), [], "Class 9 sees none of them");
  assert.deepEqual(visibleTo(other10), ["d"], "the other school sees only its own");
});

test("publishing one event at a time still works exactly as before (the single-event path is unchanged)", async () => {
  const { w, db } = setup();
  const res = await setAcademicEventPublishedCore(db, DEMO, "a", true);
  assert.equal(res.ok, true);
  assert.deepEqual(published(w), ["a", "e"]);
  assert.equal((await setAcademicEventPublishedCore(db, OTHER, "b", true)).ok, false);
});

// ---- the notifications ------------------------------------------------------------------------------------------------------------------------------------------

const info = (id: string, title: string, startDate: string, over: Partial<PublishedEventInfo> = {}): PublishedEventInfo => ({ id, title, type: "EXAM", startDate, schoolId: "demo", boardId: "bse", schoolClassId: "c10", ...over });

test("one summary notification per audience, not one per event", () => {
  const digests = calendarPublishDigests([info("1", "Unit Test 1 Begins", "2026-11-01"), info("2", "Unit Test 1 Ends", "2026-11-06"), info("3", "Diwali Holiday", "2026-11-12", { type: "HOLIDAY" })]);
  assert.equal(digests.length, 1);
  assert.deepEqual(digests[0].scope, { schoolId: "demo", boardId: "bse", schoolClassId: "c10" });
  assert.match(digests[0].message, /^3 events were added, from 2026-11-01: Unit Test 1 Begins; Unit Test 1 Ends; Diwali Holiday\.$/);
});

test("different audiences get their own notification, each saying only what concerns it", () => {
  const digests = calendarPublishDigests([info("1", "Class 10 Test", "2026-11-01"), info("2", "Class 9 Test", "2026-11-02", { schoolClassId: "c9" }), info("3", "School Picnic", "2026-11-03", { type: "EVENT", boardId: null, schoolClassId: null })]);
  assert.equal(digests.length, 3);
  const c9 = digests.find((d) => d.scope.schoolClassId === "c9")!;
  assert.match(c9.message, /^1 event was added, from 2026-11-02: Class 9 Test\.$/);
  assert.ok(!c9.message.includes("Class 10 Test"));
  assert.equal(digests.find((d) => d.scope.boardId === null)!.type, "SYSTEM", "no exam in the group: an ordinary notice");
  assert.equal(c9.type, "EXAM");
});

test("a long list is summarised: the first three titles and a count", () => {
  const events = Array.from({ length: 8 }, (_, i) => info(String(i), `Event ${i + 1}`, `2026-11-0${i + 1}`));
  const [d] = calendarPublishDigests(events);
  assert.match(d.message, /^8 events were added, from 2026-11-01: Event 1; Event 2; Event 3; and 5 more\.$/);
  assert.ok(d.message.length < 400);
});

test("nothing published means nothing to say", () => {
  assert.deepEqual(calendarPublishDigests([]), []);
});
