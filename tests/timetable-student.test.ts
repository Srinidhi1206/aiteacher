// Offline tests for what a student's Timetable page shows (lib/timetable/core.ts: studentTimetableCore): only a PUBLISHED timetable of the student's own school and class, their
// own section's when they are in one, never another school's, class's or section's. In-memory database; no network.
import { test } from "node:test";
import assert from "node:assert/strict";

import { studentTimetableCore, type TimetableDb } from "@/lib/timetable/core";
import { matches } from "./fake-where";

type TT = { id: string; schoolId: string; schoolClassId: string; section: string; isPublished: boolean; title: string | null; academicYear: string | null; schoolClass: { label: string } };
const tt = (id: string, over: Partial<TT> = {}): TT => ({ id, schoolId: "demo", schoolClassId: "c10", section: "", isPublished: true, title: `Timetable ${id}`, academicYear: "2026-27", schoolClass: { label: "Class 10" }, ...over });

function db(timetables: TT[], enrolments: { userId: string; classId: string; section: string }[] = []) {
  const entriesFor = (id: string) => [{ id: `${id}-e1`, timetableId: id, dayOfWeek: 1, period: 1, subject: "Maths" }];
  return {
    timetable: { findMany: async ({ where }: { where: unknown }) => timetables.filter((t) => matches(t as never, where)) },
    classSectionEnrollment: {
      findMany: async ({ where }: { where: { student: { userId: string }; section: { schoolClassId: string } } }) =>
        enrolments.filter((e) => e.userId === where.student.userId && e.classId === where.section.schoolClassId).map((e) => ({ section: { name: e.section } })),
    },
    timetableEntry: { findMany: async ({ where }: { where: { timetableId: string } }) => entriesFor(where.timetableId) },
  } as unknown as TimetableDb;
}
const me = { userId: "u1", schoolId: "demo", schoolClassId: "c10" };

test("a student sees their school's published timetable for their class, with its periods", async () => {
  const r = await studentTimetableCore(db([tt("a")]), me);
  assert.deepEqual([r?.id, r?.className, r?.entries.length], ["a", "Class 10", 1]);
});

test("a draft (unpublished) timetable is never shown", async () => {
  assert.equal(await studentTimetableCore(db([tt("a", { isPublished: false })]), me), null);
});

test("another school's or another class's timetable is never shown", async () => {
  assert.equal(await studentTimetableCore(db([tt("a", { schoolId: "other" }), tt("b", { schoolClassId: "c9" })]), me), null);
});

test("a student with no school or no class sees nothing", async () => {
  assert.equal(await studentTimetableCore(db([tt("a")]), { ...me, schoolId: null as never }), null);
  assert.equal(await studentTimetableCore(db([tt("a")]), { ...me, schoolClassId: null as never }), null);
});

test("a student in a section gets their own section's timetable; others get the whole-class one; nobody gets another section's", async () => {
  const list = [tt("whole"), tt("secA", { section: "A" }), tt("secB", { section: "B" })];
  const enrol = [{ userId: "u1", classId: "c10", section: "A" }, { userId: "u2", classId: "c10", section: "B" }];
  assert.equal((await studentTimetableCore(db(list, enrol), me))?.id, "secA");
  assert.equal((await studentTimetableCore(db(list, enrol), { ...me, userId: "u2" }))?.id, "secB");
  assert.equal((await studentTimetableCore(db(list, enrol), { ...me, userId: "u3" }))?.id, "whole", "no section: the whole-class one");
  assert.equal(await studentTimetableCore(db([tt("secB", { section: "B" })], enrol), me), null, "only another section's exists: nothing, not B's");
});
