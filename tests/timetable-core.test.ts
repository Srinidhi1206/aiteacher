// Offline tests for the timetable MANAGEMENT workflow (lib/timetable/core.ts): who may import, publish, replace, delete and list timetables, what is validated on the server
// whatever the screen allowed, that a failed import changes nothing, and that nothing crosses schools. (What a student SEES is tests/timetable-student.test.ts.)
// In-memory database with real transaction semantics (a failed callback leaves no trace); no network.
import { test } from "node:test";
import assert from "node:assert/strict";

import { confirmTimetableImportCore, setTimetablePublishedCore, deleteTimetableCore, listTimetablesCore, normalizeSection, type TimetableActor, type TimetableDb } from "@/lib/timetable/core";
import { flagOverlaps, suggestClass } from "@/lib/timetable/normalize";
import { isValidTime } from "@/lib/timetable/parts";
import type { PreviewPeriod } from "@/lib/timetable/types";

type TT = { id: string; schoolId: string; schoolClassId: string; section: string; title: string | null; academicYear: string | null; isPublished: boolean; sourceName: string | null; sourceUrl: string | null; createdByUserId: string; updatedAt: Date };
type Entry = { id: string; timetableId: string; day: number; period: number | null; startTime: string | null; endTime: string | null; subjectName: string; subjectId: string | null; teacherName: string | null; room: string | null };

const SCHOOLS: Record<string, { id: string; name: string; boardId: string | null; isEnabled: boolean }> = {
  demo: { id: "demo", name: "TeachAI Demo School", boardId: "bse", isEnabled: true },
  other: { id: "other", name: "Other School", boardId: "bse", isEnabled: true },
  cbse: { id: "cbse", name: "CBSE School", boardId: "cbse", isEnabled: true },
  off: { id: "off", name: "Closed School", boardId: "bse", isEnabled: false },
};
const CLASSES: Record<string, { id: string; label: string; grade: number; boardId: string; board: { shortName: string } }> = {
  c10: { id: "c10", label: "Class 10", grade: 10, boardId: "bse", board: { shortName: "BSE Telangana" } },
  c9: { id: "c9", label: "Class 9", grade: 9, boardId: "bse", board: { shortName: "BSE Telangana" } },
  cbse10: { id: "cbse10", label: "Class 10 (CBSE)", grade: 10, boardId: "cbse", board: { shortName: "CBSE" } },
};
const SUBJECTS = [{ subject: { id: "sub-maths", name: "Mathematics" } }, { subject: { id: "sub-eng", name: "English" } }];

function world() {
  const data = { tts: [] as TT[], entries: [] as Entry[] };
  const state = { audit: [] as { userId: string; resource: string; message: string }[], seq: 0, failEntryCreate: false };
  const api = (d: typeof data) => ({
    school: { findUnique: async ({ where }: { where: { id: string } }) => SCHOOLS[where.id] ?? null },
    schoolClass: { findUnique: async ({ where }: { where: { id: string } }) => CLASSES[where.id] ?? null },
    schoolClassSubject: { findMany: async () => SUBJECTS },
    auditLog: { create: async ({ data: a }: { data: { userId: string; resource: string; message: string } }) => void state.audit.push(a) },
    timetable: {
      findUnique: async ({ where, include }: { where: { id?: string; schoolId_schoolClassId_section?: { schoolId: string; schoolClassId: string; section: string } }; include?: object }) => {
        const k = where.schoolId_schoolClassId_section;
        const t = where.id ? d.tts.find((x) => x.id === where.id) : d.tts.find((x) => x.schoolId === k!.schoolId && x.schoolClassId === k!.schoolClassId && x.section === k!.section);
        if (!t) return null;
        return include ? { ...t, schoolClass: { label: CLASSES[t.schoolClassId].label }, school: { name: SCHOOLS[t.schoolId].name } } : t;
      },
      findMany: async ({ where }: { where: { schoolId?: string } }) =>
        d.tts.filter((t) => where.schoolId === undefined || t.schoolId === where.schoolId).map((t) => ({ ...t, school: { name: SCHOOLS[t.schoolId].name }, schoolClass: { label: CLASSES[t.schoolClassId].label, grade: CLASSES[t.schoolClassId].grade, board: CLASSES[t.schoolClassId].board }, _count: { entries: d.entries.filter((e) => e.timetableId === t.id).length } })),
      create: async ({ data: x }: { data: Omit<TT, "id" | "updatedAt"> }) => {
        const t = { ...x, id: `tt${++state.seq}`, updatedAt: new Date() } as TT;
        d.tts.push(t);
        return t;
      },
      update: async ({ where, data: x }: { where: { id: string }; data: Partial<TT> }) => Object.assign(d.tts.find((t) => t.id === where.id)!, x),
      delete: async ({ where }: { where: { id: string } }) => {
        d.tts = d.tts.filter((t) => t.id !== where.id);
        d.entries = d.entries.filter((e) => e.timetableId !== where.id);
      },
    },
    timetableEntry: {
      deleteMany: async ({ where }: { where: { timetableId: string } }) => void (d.entries = d.entries.filter((e) => e.timetableId !== where.timetableId)),
      createMany: async ({ data: rows }: { data: Omit<Entry, "id">[] }) => {
        if (state.failEntryCreate) throw new Error("simulated failure while saving the periods");
        for (const r of rows) d.entries.push({ ...r, id: `e${++state.seq}` });
      },
      findMany: async ({ where }: { where: { timetableId: string } }) => d.entries.filter((e) => e.timetableId === where.timetableId),
    },
  });
  const db = {
    ...api(data),
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
      const staging = structuredClone(data);
      const result = await fn(api(staging));
      data.tts = staging.tts;
      data.entries = staging.entries;
      return result;
    },
  };
  return { data, state, db: db as unknown as TimetableDb };
}

const DEMO: TimetableActor = { userId: "admin-demo", isSuperAdmin: false, schoolId: "demo" };
const OTHER: TimetableActor = { userId: "admin-other", isSuperAdmin: false, schoolId: "other" };
const SUPER: TimetableActor = { userId: "super", isSuperAdmin: true, schoolId: null };
const NO_SCHOOL: TimetableActor = { userId: "lonely", isSuperAdmin: false, schoolId: null };

const period = (over: Record<string, unknown> = {}) => ({ day: 1, period: 1, startTime: "09:00", endTime: "09:45", subject: "Mathematics", teacher: "Ms Rao", room: "A1", ...over });
const group = (over: Record<string, unknown> = {}) => ({ schoolClassId: "c10", section: "", periods: [period(), period({ period: 2, startTime: "09:50", endTime: "10:35", subject: "english" })], ...over });
const input = (over: Record<string, unknown> = {}) => ({ groups: [group()], ...over });

// ---- who may import, and into which school -----------------------------------------------------------------------------------------------------------------------------

test("a school administrator imports into THEIR OWN school, whatever school the request names", async () => {
  const w = world();
  const res = await confirmTimetableImportCore(w.db, DEMO, input({ schoolId: "other" }));
  assert.equal(res.ok, true);
  assert.deepEqual(w.data.tts.map((t) => t.schoolId), ["demo"], "the requested 'other' school was ignored");
  assert.equal(w.data.tts[0].isPublished, false, "an import is a draft unless publishing was chosen");
});

test("the super administrator must name an existing, enabled school; an administrator with no school can import nothing", async () => {
  const w = world();
  assert.deepEqual(await confirmTimetableImportCore(w.db, SUPER, input()), { ok: false, error: "Choose the school this timetable is for." });
  assert.deepEqual(await confirmTimetableImportCore(w.db, SUPER, input({ schoolId: "nope" })), { ok: false, error: "School not found." });
  assert.deepEqual(await confirmTimetableImportCore(w.db, SUPER, input({ schoolId: "off" })), { ok: false, error: "That school is disabled." });
  assert.equal((await confirmTimetableImportCore(w.db, NO_SCHOOL, input())).ok, false);
  assert.equal((await confirmTimetableImportCore(w.db, SUPER, input({ schoolId: "demo" }))).ok, true);
  assert.equal(w.data.tts.length, 1);
});

test("a class of another board cannot have a timetable at a school that does not teach that board; an unknown class is refused", async () => {
  const w = world();
  const wrongBoard = await confirmTimetableImportCore(w.db, DEMO, input({ groups: [group({ schoolClassId: "cbse10" })] }));
  assert.equal(wrongBoard.ok, false);
  assert.match(wrongBoard.ok ? "" : wrongBoard.error, /does not teach CBSE/);
  assert.equal((await confirmTimetableImportCore(w.db, DEMO, input({ groups: [group({ schoolClassId: "ghost" })] }))).ok, false);
  assert.equal(w.data.tts.length, 0);
});

// ---- validation happens on the server, whatever the screen allowed -------------------------------------------------------------------------------------------------------

test("each period is validated again on the server: end after start, both times or neither, a subject, a period number or a start time, real times", async () => {
  const w = world();
  const bad: [string, Record<string, unknown>][] = [
    ["end before start", { startTime: "10:00", endTime: "09:00" }],
    ["end equal to start", { startTime: "10:00", endTime: "10:00" }],
    ["only a start time", { startTime: "10:00", endTime: "" }],
    ["only an end time", { startTime: "", endTime: "10:00" }],
    ["no subject", { subject: "  " }],
    ["no period number and no start time", { period: null, startTime: "", endTime: "" }],
    ["an impossible time", { startTime: "25:99", endTime: "26:00" }],
    ["day 0", { day: 0 }],
    ["day 8", { day: 8 }],
  ];
  for (const [name, over] of bad) {
    const res = await confirmTimetableImportCore(w.db, DEMO, input({ groups: [group({ periods: [period(over)] })] }));
    assert.equal(res.ok, false, name);
  }
  assert.equal(w.data.tts.length, 0, "nothing was saved");
});

test("group-level rules: at least one period and at most 80; a sensible section and academic year; the same class and section twice in one import is refused", async () => {
  const w = world();
  assert.equal((await confirmTimetableImportCore(w.db, DEMO, input({ groups: [group({ periods: [] })] }))).ok, false);
  assert.equal((await confirmTimetableImportCore(w.db, DEMO, input({ groups: [group({ periods: Array.from({ length: 81 }, (_, i) => period({ period: (i % 20) + 1, day: (i % 7) + 1 })) })] }))).ok, false);
  assert.equal((await confirmTimetableImportCore(w.db, DEMO, input({ groups: [group({ section: "A;DROP" })] }))).ok, false);
  assert.equal((await confirmTimetableImportCore(w.db, DEMO, input({ groups: [group({ academicYear: "2026" })] }))).ok, false);
  const twice = await confirmTimetableImportCore(w.db, DEMO, input({ groups: [group({ section: "a" }), group({ section: "Section A" })] }));
  assert.equal(twice.ok, false, "'a' and 'Section A' are the same section");
  assert.equal((await confirmTimetableImportCore(w.db, DEMO, { groups: [] })).ok, false);
  assert.equal(w.data.tts.length, 0);
});

test("if ANY class in an import is invalid, NONE is saved", async () => {
  const w = world();
  const res = await confirmTimetableImportCore(w.db, DEMO, input({ groups: [group(), group({ schoolClassId: "c9", periods: [period({ endTime: "08:00" })] })] }));
  assert.equal(res.ok, false);
  assert.equal(w.data.tts.length, 0);
  assert.equal(w.state.audit.length, 0);
});

// ---- what is saved ------------------------------------------------------------------------------------------------------------------------------------------------------

test("subjects are linked to the class's subjects by name (any case); a name the class does not teach is kept as typed, with no link; the section is normalised", async () => {
  const w = world();
  const res = await confirmTimetableImportCore(w.db, DEMO, input({ groups: [group({ section: "section b", periods: [period({ subject: "MATHEMATICS" }), period({ period: 2, startTime: "09:50", endTime: "10:30", subject: "Library" })] })] }));
  assert.equal(res.ok, true);
  assert.equal(w.data.tts[0].section, "B");
  assert.deepEqual(w.data.entries.map((e) => [e.subjectName, e.subjectId]), [["MATHEMATICS", "sub-maths"], ["Library", null]]);
  assert.equal(normalizeSection("Div. c"), "C");
});

test("one timetable per school, class and section: a second import is refused unless the administrator chooses to replace it; the replace swaps every period and is audit-logged", async () => {
  const w = world();
  await confirmTimetableImportCore(w.db, DEMO, input());
  const refused = await confirmTimetableImportCore(w.db, DEMO, input());
  assert.equal(refused.ok, false);
  assert.match(refused.ok ? "" : refused.error, /already has a timetable/);
  assert.equal(w.data.tts.length, 1);
  const replaced = await confirmTimetableImportCore(w.db, DEMO, input({ groups: [group({ replace: true, periods: [period({ subject: "English" })] })] }));
  assert.equal(replaced.ok && replaced.data.timetables[0].replaced, true);
  assert.equal(w.data.tts.length, 1, "still one timetable");
  assert.deepEqual(w.data.entries.map((e) => e.subjectName), ["English"], "the old periods are gone, the new ones are there");
  assert.match(w.state.audit.at(-1)!.message, /replaced/);
});

test("a failure while saving the periods leaves the existing timetable exactly as it was (no half-replaced timetable)", async () => {
  const w = world();
  await confirmTimetableImportCore(w.db, DEMO, input());
  const before = JSON.stringify([w.data.tts, w.data.entries]);
  w.state.failEntryCreate = true;
  await assert.rejects(() => confirmTimetableImportCore(w.db, DEMO, input({ groups: [group({ replace: true, periods: [period({ subject: "English" })] })] })), /simulated failure/);
  assert.equal(JSON.stringify([w.data.tts, w.data.entries]), before);
});

// ---- publishing, deleting, listing - and nothing crosses schools ---------------------------------------------------------------------------------------------------

test("only the owning school's administrator (or the super administrator) can publish, unpublish or delete; another school's gets 'not found', the same as for a missing id", async () => {
  const w = world();
  await confirmTimetableImportCore(w.db, DEMO, input());
  const id = w.data.tts[0].id;
  assert.deepEqual(await setTimetablePublishedCore(w.db, OTHER, id, true), { ok: false, error: "Timetable not found." });
  assert.deepEqual(await setTimetablePublishedCore(w.db, OTHER, "ghost", true), { ok: false, error: "Timetable not found." });
  assert.deepEqual(await deleteTimetableCore(w.db, OTHER, id), { ok: false, error: "Timetable not found." });
  assert.equal(w.data.tts[0].isPublished, false);
  assert.equal((await setTimetablePublishedCore(w.db, DEMO, id, true)).ok, true);
  assert.equal(w.data.tts[0].isPublished, true);
  assert.equal((await setTimetablePublishedCore(w.db, SUPER, id, false)).ok, true);
  assert.equal(w.data.tts[0].isPublished, false);
  assert.equal((await deleteTimetableCore(w.db, DEMO, id)).ok, true);
  assert.equal(w.data.tts.length + w.data.entries.length, 0, "the timetable and its periods are gone");
});

test("publishing something already published (or unpublishing a draft) changes nothing and writes no audit entry", async () => {
  const w = world();
  await confirmTimetableImportCore(w.db, DEMO, input());
  const id = w.data.tts[0].id;
  const logged = w.state.audit.length;
  await setTimetablePublishedCore(w.db, DEMO, id, false);
  assert.equal(w.state.audit.length, logged);
  await setTimetablePublishedCore(w.db, DEMO, id, true);
  await setTimetablePublishedCore(w.db, DEMO, id, true);
  assert.equal(w.state.audit.length, logged + 1);
});

test("a school administrator lists only their own school's timetables; the super administrator all; an administrator with no school none", async () => {
  const w = world();
  await confirmTimetableImportCore(w.db, DEMO, input());
  await confirmTimetableImportCore(w.db, OTHER, input());
  assert.deepEqual((await listTimetablesCore(w.db, DEMO)).map((t) => t.schoolName), ["TeachAI Demo School"]);
  assert.deepEqual((await listTimetablesCore(w.db, SUPER)).map((t) => t.schoolName).sort(), ["Other School", "TeachAI Demo School"]);
  assert.deepEqual(await listTimetablesCore(w.db, NO_SCHOOL), []);
  assert.equal((await listTimetablesCore(w.db, DEMO))[0].periods, 2);
});

// ---- the pieces the review screen uses ---------------------------------------------------------------------------------------------------------------------------------------

test("times: only real 24-hour times are valid", () => {
  for (const ok of ["00:00", "09:05", "23:59"]) assert.equal(isValidTime(ok), true, ok);
  for (const bad of ["24:00", "9:5", "12:60", "", "noon", "09.30"]) assert.equal(isValidTime(bad), false, bad);
});

const prev = (over: Partial<PreviewPeriod>): PreviewPeriod => ({ id: "p", day: 1, period: "1", startTime: "09:00", endTime: "09:45", subject: "Maths", teacher: "", room: "", confidence: "high", warnings: [], sourceText: "", ...over } as PreviewPeriod);

test("the review screen flags a period that overlaps the one before it, and does not flag back-to-back periods or other days", () => {
  const rows = [prev({ id: "a" }), prev({ id: "b", startTime: "09:30", endTime: "10:00", subject: "English" }), prev({ id: "c", startTime: "10:00", endTime: "10:40", subject: "Science" }), prev({ id: "d", day: 2, startTime: "09:10", endTime: "09:50" })];
  flagOverlaps(rows);
  assert.equal(rows[1].confidence, "review");
  assert.match(rows[1].warnings.join(" "), /Overlaps the previous period \(Maths, 09:00-09:45\)/);
  assert.equal(rows[2].confidence, "high", "10:00 right after 10:00 is not an overlap");
  assert.equal(rows[3].confidence, "high", "another day");
});

test("a detected class heading is matched to the school's class only when the grade is unambiguous", () => {
  const classes = [{ id: "c9", grade: 9 }, { id: "c10a", grade: 10 }, { id: "c10b", grade: 10 }, { id: "c8", grade: 8 }];
  assert.equal(suggestClass({ className: "Class 9" }, classes)?.id, "c9");
  assert.equal(suggestClass({ className: "Class 10" }, classes), null, "two classes of grade 10: no guess");
  assert.equal(suggestClass({ className: "Staff room" }, classes), null);
});
