// Offline tests for what saving a calendar import does on the server (lib/calendar-import/core.ts), run against an IN-MEMORY fake database:
// the events become DRAFTS in the store (and stay there between calls, like a refresh), a repeat never creates duplicates, nothing is ever
// published, and the audience rules hold. No real database, OCR, Gemini or network is involved.
import { test } from "node:test";
import assert from "node:assert/strict";

import type { CalendarActor, CalendarDb } from "@/lib/calendar/core";
import { confirmCalendarImportCore, findImportDuplicatesCore } from "@/lib/calendar-import/core";
import { filterByView } from "@/lib/calendar/view";

type Stored = { id: string; title: string; type: string; startDate: Date; endDate: Date | null; description: string | null; academicYear: string | null; isPublished: boolean; schoolId: string | null; boardId: string | null; schoolClassId: string | null; createdByUserId: string | null };

const SCHOOLS = { demo: { id: "demo", name: "TeachAI Demo School", boardId: "bse" }, other: { id: "other", name: "Other School", boardId: "cbse" } } as Record<string, { id: string; name: string; boardId: string | null }>;
const BOARDS = { bse: { id: "bse", shortName: "BSE Telangana" }, cbse: { id: "cbse", shortName: "CBSE" } } as Record<string, { id: string; shortName: string }>;
const CLASSES = { c10: { id: "c10", boardId: "bse", label: "Class 10" }, c9: { id: "c9", boardId: "bse", label: "Class 9" }, cb10: { id: "cb10", boardId: "cbse", label: "Class 10" } } as Record<string, { id: string; boardId: string; label: string }>;

function fakeDb() {
  const store: Stored[] = [];
  const audit: { resource?: string; message: string }[] = [];
  const calls = { createMany: 0, update: 0, publish: 0 };
  const same = (a: string | null, b: string | null) => (a ?? null) === (b ?? null);
  const db = {
    academicEvent: {
      findMany: async ({ where }: { where: { startDate: { gte: Date; lte: Date }; OR: { schoolId: string | null; boardId: string | null; schoolClassId: string | null }[] } }) =>
        store.filter((e) => e.startDate >= where.startDate.gte && e.startDate <= where.startDate.lte && where.OR.some((s) => same(e.schoolId, s.schoolId) && same(e.boardId, s.boardId) && same(e.schoolClassId, s.schoolClassId))),
      createMany: async ({ data }: { data: Omit<Stored, "id">[] }) => {
        calls.createMany++;
        data.forEach((d, i) => store.push({ ...d, id: `ev${store.length + i + 1}` }));
        return { count: data.length };
      },
      update: async () => {
        calls.update++;
        throw new Error("an import must never update an event");
      },
    },
    school: { findUnique: async ({ where }: { where: { id: string } }) => SCHOOLS[where.id] ?? null },
    board: { findUnique: async ({ where }: { where: { id: string } }) => BOARDS[where.id] ?? null },
    schoolClass: { findUnique: async ({ where }: { where: { id: string } }) => CLASSES[where.id] ?? null },
    auditLog: { create: async ({ data }: { data: { resource?: string; message: string } }) => void audit.push(data) },
  } as unknown as CalendarDb;
  return { db, store, audit, calls };
}

const SUPER: CalendarActor = { userId: "super", isSuperAdmin: true, schoolId: null };
const DEMO_ADMIN: CalendarActor = { userId: "demo-admin", isSuperAdmin: false, schoolId: "demo" };
const DEMO_SCOPE = { schoolId: "demo", boardId: "bse", schoolClassId: "c10" };
const ev = (title: string, startDate: string, over: Record<string, unknown> = {}) => ({ title, type: "HOLIDAY", startDate, endDate: "", description: "", academicYear: "2026-27", schoolClassId: "", ...over });
const THREE = [ev("Independence Day", "2026-08-15"), ev("Dasara Holidays", "2026-10-11", { endDate: "2026-10-20" }), ev("Half Yearly Exams", "2026-12-01", { type: "EXAM" })];

test("saving creates DRAFT events in the store, for the chosen school, board and class, and writes one audit entry", async () => {
  const { db, store, audit } = fakeDb();
  const res = await confirmCalendarImportCore(db, SUPER, { scope: DEMO_SCOPE, sourceName: "calendar.png", events: THREE });
  assert.deepEqual(res.ok && [res.created, res.skipped.length], [3, 0]);
  assert.equal(store.length, 3);
  for (const e of store) {
    assert.equal(e.isPublished, false, "a saved import is a draft");
    assert.deepEqual([e.schoolId, e.boardId, e.schoolClassId], ["demo", "bse", "c10"]);
    assert.equal(e.academicYear, "2026-27");
    assert.equal(e.createdByUserId, "super");
  }
  assert.equal(store[1].endDate?.toISOString().slice(0, 10), "2026-10-20");
  assert.equal(audit.length, 1);
  assert.match(audit[0].message, /3 events created as drafts/);
  assert.match(audit[0].message, /TeachAI Demo School/);
});

test("saved drafts are still there on a later call (a refresh / coming back later) and appear in the Drafts view, unpublished", async () => {
  const { db, store } = fakeDb();
  await confirmCalendarImportCore(db, SUPER, { scope: DEMO_SCOPE, events: THREE });
  // A "later visit": the dialog's React state is gone; only what is in the database matters.
  const listed = store.map((e) => ({ id: e.id, title: e.title, isPublished: e.isPublished }));
  assert.deepEqual(filterByView(listed, "drafts").map((e) => e.title), ["Independence Day", "Dasara Holidays", "Half Yearly Exams"]);
  assert.equal(filterByView(listed, "published").length, 0);
});

test("saving NEVER publishes: every created event is unpublished and no update/publish call is made", async () => {
  const { db, store, calls } = fakeDb();
  await confirmCalendarImportCore(db, SUPER, { scope: DEMO_SCOPE, events: THREE, isPublished: true, published: true });
  assert.ok(store.every((e) => e.isPublished === false));
  assert.deepEqual([calls.update, calls.publish], [0, 0]);
});

test("saving the same events again creates no duplicates (repeated clicks / a retry): the second save skips all of them", async () => {
  const { db, store, calls } = fakeDb();
  const first = await confirmCalendarImportCore(db, SUPER, { scope: DEMO_SCOPE, events: THREE });
  const second = await confirmCalendarImportCore(db, SUPER, { scope: DEMO_SCOPE, events: THREE });
  const third = await confirmCalendarImportCore(db, SUPER, { scope: DEMO_SCOPE, events: THREE });
  assert.deepEqual(first.ok && first.created, 3);
  assert.deepEqual(second.ok && [second.created, second.skipped.length], [0, 3]);
  assert.deepEqual(third.ok && [third.created, third.skipped.length], [0, 3]);
  assert.equal(store.length, 3, "still exactly three events");
  assert.equal(calls.createMany, 1, "nothing was written by the repeats");
});

test("duplicates inside one save are collapsed, and a partly-saved batch can be finished without repeating the first part", async () => {
  const { db, store } = fakeDb();
  const withRepeat = [...THREE, ev("independence day", "2026-08-15")];
  const res = await confirmCalendarImportCore(db, SUPER, { scope: DEMO_SCOPE, events: withRepeat });
  assert.deepEqual(res.ok && [res.created, res.skipped.length], [3, 1]);
  const rest = await confirmCalendarImportCore(db, SUPER, { scope: DEMO_SCOPE, events: [...THREE, ev("Sankranti", "2027-01-14")] });
  assert.deepEqual(rest.ok && [rest.created, rest.skipped.length], [1, 3]);
  assert.equal(store.length, 4);
});

test("the duplicate check used by the preview agrees with what the save will skip", async () => {
  const { db } = fakeDb();
  await confirmCalendarImportCore(db, SUPER, { scope: DEMO_SCOPE, events: [THREE[0]] });
  const dup = await findImportDuplicatesCore(db, SUPER, { scope: DEMO_SCOPE, events: THREE.map((e) => ({ title: e.title, startDate: e.startDate })) });
  assert.deepEqual(dup.ok && dup.duplicates, [true, false, false]);
});

test("a different audience is not a duplicate: the same event for another class is still created", async () => {
  const { db, store } = fakeDb();
  await confirmCalendarImportCore(db, SUPER, { scope: DEMO_SCOPE, events: [THREE[0]] });
  const res = await confirmCalendarImportCore(db, SUPER, { scope: { schoolId: "demo", boardId: "bse", schoolClassId: "c9" }, events: [THREE[0]] });
  assert.deepEqual(res.ok && res.created, 1);
  assert.equal(store.length, 2);
});

// ---------- audience scoping ----------

test("a school administrator can only ever save into THEIR OWN school, whatever the request says", async () => {
  const { db, store } = fakeDb();
  const res = await confirmCalendarImportCore(db, DEMO_ADMIN, { scope: { schoolId: "other", boardId: "", schoolClassId: "c10" }, events: [THREE[0]] });
  assert.ok(res.ok);
  assert.deepEqual([store[0].schoolId, store[0].boardId, store[0].schoolClassId], ["demo", "bse", "c10"]);
});

test("an administrator without a school cannot save", async () => {
  const { db, store } = fakeDb();
  const res = await confirmCalendarImportCore(db, { userId: "x", isSuperAdmin: false, schoolId: null }, { scope: {}, events: [THREE[0]] });
  assert.equal(res.ok, false);
  assert.equal(store.length, 0);
});

test("class, board and school must agree: a class of another board, or a school that teaches another board, is refused and nothing is saved", async () => {
  const { db, store } = fakeDb();
  const wrongBoard = await confirmCalendarImportCore(db, SUPER, { scope: { schoolId: "demo", boardId: "cbse", schoolClassId: "c10" }, events: [THREE[0]] });
  assert.equal(wrongBoard.ok, false);
  const otherBoardSchool = await confirmCalendarImportCore(db, SUPER, { scope: { schoolId: "demo", boardId: "", schoolClassId: "cb10" }, events: [THREE[0]] });
  assert.equal(otherBoardSchool.ok, false);
  const missingSchool = await confirmCalendarImportCore(db, SUPER, { scope: { schoolId: "nope", boardId: "", schoolClassId: "" }, events: [THREE[0]] });
  assert.equal(missingSchool.ok, false);
  assert.equal(store.length, 0);
});

test("a per-row class override is checked against the same rules, and the audience of each row is kept apart", async () => {
  const { db, store } = fakeDb();
  const ok = await confirmCalendarImportCore(db, SUPER, { scope: { schoolId: "demo", boardId: "bse", schoolClassId: "" }, events: [ev("Class 9 Picnic", "2026-09-10", { schoolClassId: "c9" }), ev("School Day", "2026-09-11")] });
  assert.ok(ok.ok);
  assert.deepEqual(store.map((e) => e.schoolClassId), ["c9", null]);
  const bad = await confirmCalendarImportCore(db, SUPER, { scope: { schoolId: "demo", boardId: "bse", schoolClassId: "" }, events: [ev("Wrong", "2026-09-12", { schoolClassId: "cb10" })] });
  assert.equal(bad.ok, false);
  assert.equal(store.length, 2);
});

// ---------- the server never trusts the preview ----------

test("invalid input is refused as a whole with a message, creating nothing: bad dates, end before start, no events, too many events", async () => {
  const { db, store } = fakeDb();
  assert.equal((await confirmCalendarImportCore(db, SUPER, { scope: DEMO_SCOPE, events: [ev("Bad", "2026-02-31")] })).ok, false);
  assert.equal((await confirmCalendarImportCore(db, SUPER, { scope: DEMO_SCOPE, events: [ev("Backwards", "2026-08-15", { endDate: "2026-08-10" })] })).ok, false);
  assert.equal((await confirmCalendarImportCore(db, SUPER, { scope: DEMO_SCOPE, events: [] })).ok, false);
  assert.equal((await confirmCalendarImportCore(db, SUPER, { scope: DEMO_SCOPE, events: [ev("", "2026-08-15")] })).ok, false);
  const tooMany = Array.from({ length: 400 }, (_, i) => ev(`E${i}`, "2026-08-15"));
  const res = await confirmCalendarImportCore(db, SUPER, { scope: DEMO_SCOPE, events: tooMany });
  assert.equal(res.ok, false);
  assert.equal(store.length, 0);
});
