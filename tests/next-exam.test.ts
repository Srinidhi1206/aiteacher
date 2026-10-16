// Offline tests for "what is my next exam?" (lib/calendar/next-exam.ts): the REAL scope rules run against an in-memory fake database, so a draft, another
// school's, another board's or another class's exam can be shown to never reach a student, and the day arithmetic is checked at the boundaries.
// No real database, network, OCR or AI is involved.
import { test } from "node:test";
import assert from "node:assert/strict";

import { addDays, buildExamItems, daysBetween, describeDaysUntil, examLabel, findNextExam, findNextExamAt, isExamEnd, localDateString, MAX_EXAM_SPAN_DAYS, pickNextExam, todayInIndia, utcDateString, type ExamDb } from "@/lib/calendar/next-exam";
import type { StudentCalendarScope } from "@/lib/calendar/scope";
import { matches } from "./fake-where";

type EventRow = { id: string; title: string; type: string; startDate: Date; endDate: Date | null; isPublished: boolean; schoolId: string | null; boardId: string | null; schoolClassId: string | null };
type ScheduleRow = { id: string; name: string; examDate: Date; subjectName: string; chapterScope: string; isPublished: boolean; boardId: string; schoolClassId: string; createdBy: { admin: { schoolId: string } } };

const utc = (d: string) => new Date(`${d}T00:00:00.000Z`);
const ME: StudentCalendarScope = { schoolId: "demo", boardId: "bse", schoolClassId: "c10" };
const TODAY = "2026-10-16";

let n = 0;
const ev = (over: Omit<Partial<EventRow>, "startDate"> & { title: string; startDate: string }): EventRow => ({
  id: `e${++n}`,
  type: "EXAM",
  endDate: null,
  isPublished: true,
  schoolId: "demo",
  boardId: "bse",
  schoolClassId: "c10",
  ...over,
  startDate: utc(over.startDate),
});
const sched = (over: Omit<Partial<ScheduleRow>, "examDate"> & { name: string; examDate: string }): ScheduleRow => ({
  id: `s${++n}`,
  subjectName: "Mathematics",
  chapterScope: "Chapters 1-2",
  isPublished: true,
  boardId: "bse",
  schoolClassId: "c10",
  createdBy: { admin: { schoolId: "demo" } },
  ...over,
  examDate: new Date(`${over.examDate}T12:00:00`),
});

function fakeDb(events: EventRow[], schedules: ScheduleRow[] = []): ExamDb {
  return {
    academicEvent: { findMany: async ({ where }: { where: unknown }) => events.filter((e) => matches(e as never, where)) },
    examSchedule: { findMany: async ({ where }: { where: unknown }) => schedules.filter((s) => matches(s as never, where)) },
  } as unknown as ExamDb;
}
const next = (db: ExamDb, student: StudentCalendarScope = ME, today = TODAY) => findNextExam(db, student, today);

// ---- the lookup -------------------------------------------------------------------------------------------------------------------------------

test("an exam inside the next 30 days is the next exam, with the days left", async () => {
  const r = await next(fakeDb([ev({ title: "Unit Test 3 Begins", startDate: "2026-10-26" })]));
  assert.equal(r?.label, "Unit Test 3");
  assert.equal(r?.daysUntil, 10);
  assert.equal(r?.status, "upcoming");
  assert.equal(describeDaysUntil(r!.daysUntil), "In 10 days");
});

test("an exam MORE than 30 days away is still found (the 30-day Coming-up list would not show it)", async () => {
  const r = await next(fakeDb([ev({ title: "Pre-Final Examination Begins", startDate: "2026-12-12" })]));
  assert.equal(r?.daysUntil, 57);
  assert.ok(r!.daysUntil > 30);
  assert.equal(r?.label, "Pre-Final Examination");
});

test("the NEAREST of several exams is chosen, whatever order they were stored in", async () => {
  const r = await next(fakeDb([ev({ title: "Annual Examination Begins", startDate: "2027-03-12" }), ev({ title: "Pre-Board Examination Begins", startDate: "2027-01-15" }), ev({ title: "Pre-Final Examination Begins", startDate: "2026-12-12" })]));
  assert.equal(r?.label, "Pre-Final Examination");
});

test("no upcoming exams: null - for no events at all, and when every exam is already over", async () => {
  assert.equal(await next(fakeDb([])), null);
  assert.equal(await next(fakeDb([ev({ title: "Unit Test 1 Begins", startDate: "2026-05-01" }), ev({ title: "Half-Yearly Examination Begins", startDate: "2026-08-28" })])), null);
});

test("only EXAM events count: a holiday or a results day is not an exam", async () => {
  const r = await next(fakeDb([ev({ title: "Independence Day", type: "HOLIDAY", startDate: "2026-10-17" }), ev({ title: "Half-Yearly Results", type: "RESULT", startDate: "2026-10-18" })]));
  assert.equal(r, null);
});

test("a DRAFT exam is never shown, even when it is the nearest; the published one after it is", async () => {
  const db = fakeDb([ev({ title: "Draft Test Begins", startDate: "2026-10-20", isPublished: false }), ev({ title: "Pre-Final Examination Begins", startDate: "2026-12-12" })]);
  assert.equal((await next(db))?.label, "Pre-Final Examination");
  assert.equal(await next(fakeDb([ev({ title: "Draft Test Begins", startDate: "2026-10-20", isPublished: false })])), null);
});

test("another school's, board's or class's exam never reaches the student", async () => {
  const db = fakeDb([
    ev({ title: "Other School Test Begins", startDate: "2026-10-17", schoolId: "other" }),
    ev({ title: "Other Board Test Begins", startDate: "2026-10-18", boardId: "cbse" }),
    ev({ title: "Class 9 Test Begins", startDate: "2026-10-19", schoolClassId: "c9" }),
    ev({ title: "Mine Begins", startDate: "2026-11-02" }),
  ]);
  assert.equal((await next(db))?.label, "Mine");
  // and for a student of another school the same data answers differently
  assert.equal((await next(db, { schoolId: "other", boardId: "bse", schoolClassId: "c10" }))?.label, "Other School Test");
});

test("an exam common to every school of the board + class, and a school-wide one, are both visible; one for ANOTHER school's class is not", async () => {
  const common = ev({ title: "Board Common Begins", startDate: "2026-11-10", schoolId: null });
  const wide = ev({ title: "School Wide Begins", startDate: "2026-11-05", boardId: null, schoolClassId: null });
  assert.equal((await next(fakeDb([common, wide])))?.label, "School Wide");
  assert.equal((await next(fakeDb([common])))?.label, "Board Common");
});

test("a student with no school, board or class sees no exam (nothing is guessed for them)", async () => {
  const db = fakeDb([ev({ title: "Mine Begins", startDate: "2026-11-02" })], [sched({ name: "Maths Test", examDate: "2026-11-03" })]);
  assert.equal(await next(db, { schoolId: null, boardId: "bse", schoolClassId: "c10" }), null);
  assert.equal(await next(db, { schoolId: "demo", boardId: "bse", schoolClassId: null }), null);
  // No board: the academic-calendar rule needs one, so no calendar exam is shown (an exam schedule is matched by school + class, exactly as on the student Calendar).
  assert.equal(await next(fakeDb([ev({ title: "Mine Begins", startDate: "2026-11-02" })]), { schoolId: "demo", boardId: null, schoolClassId: "c10" }), null);
});

test("the older per-subject exam schedules count too - own school only, published only", async () => {
  const db = fakeDb(
    [],
    [
      sched({ name: "Maths Unit Test", examDate: "2026-10-30" }),
      sched({ name: "Draft Science Test", examDate: "2026-10-18", isPublished: false }),
      sched({ name: "Other School Test", examDate: "2026-10-17", createdBy: { admin: { schoolId: "other" } } }),
    ]
  );
  const r = await next(db);
  assert.equal(r?.label, "Maths Unit Test");
  assert.equal(r?.source, "schedule");
  assert.deepEqual(r?.papers, [{ subjectName: "Mathematics", chapterScope: "Chapters 1-2" }]);
  assert.equal(r?.daysUntil, 14);
});

test("the nearer of a calendar exam and a schedule wins", async () => {
  const db = fakeDb([ev({ title: "Half-Yearly Examination Begins", startDate: "2026-11-20" })], [sched({ name: "Maths Unit Test", examDate: "2026-10-30" })]);
  assert.equal((await next(db))?.label, "Maths Unit Test");
});

// ---- dates, boundaries, time zones -----------------------------------------------------------------------------------------------------------

test("an exam TODAY is the next exam with 0 days; tomorrow is 1; yesterday's (finished) is not an upcoming exam", async () => {
  const today = await next(fakeDb([ev({ title: "Quiz Begins", startDate: TODAY })]));
  assert.equal(today?.daysUntil, 0);
  assert.equal(today?.status, "today");
  assert.equal(describeDaysUntil(0), "Today");
  const tomorrow = await next(fakeDb([ev({ title: "Quiz Begins", startDate: "2026-10-17" })]));
  assert.equal(tomorrow?.daysUntil, 1);
  assert.equal(describeDaysUntil(1), "Tomorrow");
  assert.equal(await next(fakeDb([ev({ title: "Quiz Begins", startDate: "2026-10-15" })])), null);
});

test("a multi-day exam still running today is 'under way'; once its last day has passed it is gone", async () => {
  const db = fakeDb([ev({ title: "Half-Yearly Examination Begins", startDate: "2026-10-15" }), ev({ title: "Half-Yearly Examination Ends", startDate: "2026-10-17" })]);
  const r = await next(db);
  assert.equal(r?.status, "ongoing");
  assert.equal(r?.label, "Half-Yearly Examination");
  assert.equal(r?.endDate, "2026-10-17");
  assert.equal(describeDaysUntil(r!.daysUntil, true), "Under way now");
  assert.equal(await next(db, ME, "2026-10-18"), null);
});

test("an 'Ends' row is not an exam of its own: with no matching 'Begins' it is ignored", async () => {
  assert.equal(await next(fakeDb([ev({ title: "Unit Test 2 Ends", startDate: "2026-10-30" })])), null);
  assert.ok(isExamEnd("Unit Test 2 Ends"));
  assert.ok(!isExamEnd("Unit Test 2 Begins"));
});

test("wording for past days: yesterday, N days ago", () => {
  assert.equal(describeDaysUntil(-1), "Yesterday");
  assert.equal(describeDaysUntil(-5), "5 days ago");
  assert.equal(describeDaysUntil(2), "In 2 days");
});

test("an academic date (stored at UTC midnight) is read as the same calendar day in any time zone; 'today' flips exactly at local midnight", () => {
  assert.equal(utcDateString(utc("2026-12-12")), "2026-12-12");
  // Dates built from local parts are the same wherever the process runs, so this holds in every zone.
  assert.equal(localDateString(new Date(2026, 9, 16, 23, 59, 59)), "2026-10-16");
  assert.equal(localDateString(new Date(2026, 9, 17, 0, 0, 0)), "2026-10-17");
  assert.equal(localDateString(new Date(2026, 0, 1, 0, 0, 0)), "2026-01-01");
});

test("day counts are whole days across month ends, year ends, a leap day and daylight-saving changes", () => {
  assert.equal(daysBetween("2026-10-31", "2026-11-01"), 1);
  assert.equal(daysBetween("2026-12-31", "2027-01-01"), 1);
  assert.equal(daysBetween("2028-02-28", "2028-03-01"), 2); // 2028 is a leap year
  assert.equal(daysBetween("2026-03-28", "2026-03-30"), 2); // spans a common DST change
  assert.equal(daysBetween("2026-10-24", "2026-10-26"), 2);
  assert.equal(daysBetween("2026-10-16", "2026-10-16"), 0);
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
  assert.equal(addDays("2026-03-01", -1), "2026-02-28");
});

// ---- building exams from rows ---------------------------------------------------------------------------------------------------------------

test("names are shown without the begin/end word", () => {
  assert.equal(examLabel("Half-Yearly Examination Begins"), "Half-Yearly Examination");
  assert.equal(examLabel("Unit Test 2 Ends"), "Unit Test 2");
  assert.equal(examLabel("Annual Examination"), "Annual Examination");
});

test("Begins/Ends rows of the same exam become one exam spanning both dates; the same exam written twice for one day counts once", () => {
  const items = buildExamItems([
    { id: "a", title: "Half-Yearly Examination Begins", startDate: "2026-08-28", endDate: null },
    { id: "b", title: "Half-Yearly Examination Ends", startDate: "2026-09-05", endDate: null },
    { id: "c", title: "Half-Yearly Examination Begins", startDate: "2026-08-28", endDate: null },
    { id: "d", title: "Unit Test 2 Begins", startDate: "2026-07-18", endDate: null },
  ]);
  assert.equal(items.length, 2);
  const half = items.find((i) => i.label === "Half-Yearly Examination")!;
  assert.deepEqual([half.startDate, half.endDate], ["2026-08-28", "2026-09-05"]);
});

test("pickNextExam ignores finished exams and orders by date, then name", () => {
  const items = buildExamItems([
    { id: "1", title: "B Test Begins", startDate: "2026-10-20", endDate: null },
    { id: "2", title: "A Test Begins", startDate: "2026-10-20", endDate: null },
    { id: "3", title: "Old Test Begins", startDate: "2026-10-01", endDate: null },
  ]);
  assert.equal(pickNextExam(items, TODAY)?.label, "A Test");
  assert.equal(pickNextExam([], TODAY), null);
});

test("the database is only asked for the student's own scope and published exam rows (the query itself carries the rule)", async () => {
  const seen: unknown[] = [];
  const db = {
    academicEvent: { findMany: async (args: { where: unknown }) => (seen.push(args.where), []) },
    examSchedule: { findMany: async (args: { where: unknown }) => (seen.push(args.where), []) },
  } as unknown as ExamDb;
  await findNextExam(db, ME, TODAY);
  const text = JSON.stringify(seen);
  assert.match(text, /"isPublished":true/);
  assert.match(text, /"type":"EXAM"/);
  assert.match(text, /"schoolId":"demo"/);
  assert.match(text, /"schoolClassId":"c10"/);
  assert.match(text, /"boardId":"bse"/);
});

// ---- Begins/Ends pairing is bounded --------------------------------------------------------------------------------------------------------------

const raw = (id: string, title: string, startDate: string) => ({ id, title, startDate, endDate: null });

test("REGRESSION: a 'Begins' with no 'Ends' of its own is NOT stretched to a later same-name exam's 'Ends'", () => {
  // the exact case from the review: Unit Test 07-18 has no Ends row; the later Unit Test 10-20..10-27 does
  const items = buildExamItems([raw("a", "Unit Test Begins", "2026-07-18"), raw("b", "Unit Test Begins", "2026-10-20"), raw("c", "Unit Test Ends", "2026-10-27")]);
  assert.deepEqual(items.map((e) => [e.startDate, e.endDate]), [["2026-07-18", null], ["2026-10-20", "2026-10-27"]]);
});

test("each same-name 'Ends' closes the nearest earlier 'Begins' before the next one, in order", () => {
  const items = buildExamItems([raw("a", "Unit Test Begins", "2026-07-18"), raw("b", "Unit Test Ends", "2026-07-25"), raw("c", "Unit Test Begins", "2026-10-20"), raw("d", "Unit Test Ends", "2026-10-27")]);
  assert.deepEqual(items.map((e) => [e.startDate, e.endDate]), [["2026-07-18", "2026-07-25"], ["2026-10-20", "2026-10-27"]]);
});

test("an 'Ends' on the very day of the next same-name 'Begins' belongs to the later exam, not the earlier", () => {
  const items = buildExamItems([raw("a", "Quiz Begins", "2026-10-01"), raw("b", "Quiz Begins", "2026-10-20"), raw("c", "Quiz Ends", "2026-10-20")]);
  assert.deepEqual(items.map((e) => [e.startDate, e.endDate]), [["2026-10-01", null], ["2026-10-20", null]]);
});

test("an 'Ends' further than the longest sensible exam after its 'Begins' is not paired", () => {
  const far = addDays("2026-10-20", MAX_EXAM_SPAN_DAYS + 1);
  const items = buildExamItems([raw("a", "Annual Begins", "2026-10-20"), raw("b", "Annual Ends", far)]);
  assert.deepEqual(items.map((e) => [e.startDate, e.endDate]), [["2026-10-20", null]]);
  const ok = buildExamItems([raw("a", "Annual Begins", "2026-10-20"), raw("b", "Annual Ends", addDays("2026-10-20", MAX_EXAM_SPAN_DAYS))]);
  assert.equal(ok[0].endDate, addDays("2026-10-20", MAX_EXAM_SPAN_DAYS));
});

// ---- one exam in both sources ------------------------------------------------------------------------------------------------------------------

const sch = (name: string, examDate: string, subjectName = "Mathematics", chapterScope = "Chapters 1-2") => ({ id: `sch-${name}-${examDate}-${subjectName}`, name, examDate, subjectName, chapterScope });

test("the same exam in both sources (same name, same day) is ONE exam: the calendar's date range with the schedule's subject and chapters", () => {
  const items = buildExamItems([raw("a", "Half-Yearly Examination Begins", "2026-11-02"), raw("b", "Half-Yearly Examination Ends", "2026-11-09")], [sch("Half-Yearly Examination", "2026-11-02")]);
  assert.equal(items.length, 1);
  assert.equal(items[0].source, "calendar");
  assert.deepEqual([items[0].startDate, items[0].endDate], ["2026-11-02", "2026-11-09"]);
  assert.deepEqual(items[0].papers, [{ subjectName: "Mathematics", chapterScope: "Chapters 1-2" }]);
});

test("several subject papers inside one calendar exam's dates are all kept on it (their subjects and chapters), not turned into separate exams", () => {
  const items = buildExamItems(
    [raw("a", "Half-Yearly Examination Begins", "2026-11-02"), raw("b", "Half-Yearly Examination Ends", "2026-11-09")],
    [sch("Mathematics Half-Yearly Examination", "2026-11-02"), sch("Science Half-Yearly Examination", "2026-11-04", "Physical Science", "Chemical Reactions"), sch("Half-Yearly Examination", "2026-11-06", "English", "")]
  );
  assert.equal(items.length, 1);
  assert.deepEqual(items[0].papers.map((p) => p.subjectName), ["Mathematics", "Physical Science", "English"]);
  assert.equal(items[0].papers[2].chapterScope, null, "an empty scope is no scope");
});

test("exams are NOT merged just because their dates match: unrelated names stay separate", () => {
  const items = buildExamItems([raw("a", "Half-Yearly Examination Begins", "2026-11-02")], [sch("Drawing Competition", "2026-11-02", "Art", "")]);
  assert.equal(items.length, 2);
  assert.deepEqual(items.map((e) => e.source).sort(), ["calendar", "schedule"]);
});

test("related names on different, non-overlapping dates are separate exams", () => {
  const items = buildExamItems([raw("a", "Unit Test 2 Begins", "2026-11-02")], [sch("Mathematics Unit Test 2", "2026-12-20")]);
  assert.equal(items.length, 2);
});

test("'Unit Test 1' and 'Unit Test 2' on the same day are different exams", () => {
  const items = buildExamItems([raw("a", "Unit Test 1 Begins", "2026-11-02")], [sch("Mathematics Unit Test 2", "2026-11-02")]);
  assert.equal(items.length, 2);
});

test("a schedule with no calendar exam is an exam of its own; the same paper entered twice counts once", () => {
  const items = buildExamItems([], [sch("Maths Test", "2026-10-30"), sch("Maths Test", "2026-10-30")]);
  assert.equal(items.length, 1);
  assert.equal(items[0].source, "schedule");
});

test("through the database layer: both sources describing one exam give ONE next exam, with the schedule's subject", async () => {
  const db = fakeDb([ev({ title: "Half-Yearly Examination Begins", startDate: "2026-11-02" })], [sched({ name: "Half-Yearly Examination", examDate: "2026-11-02" })]);
  const r = await next(db);
  assert.equal(r?.label, "Half-Yearly Examination");
  assert.deepEqual(r?.papers.map((p) => p.subjectName), ["Mathematics"]);
});

// ---- a failed lookup is not "no exam" ------------------------------------------------------------------------------------------------------------

test("if the academic-event query fails the lookup THROWS - it is never turned into 'no upcoming exam'", async () => {
  const db = {
    academicEvent: { findMany: async () => Promise.reject(new Error("simulated database failure")) },
    examSchedule: { findMany: async () => [] },
  } as unknown as ExamDb;
  await assert.rejects(() => next(db), /simulated database failure/);
  assert.equal(await next(fakeDb([])), null, "while a genuine 'none' is null");
});

test("if the exam-schedule query fails the lookup throws too", async () => {
  const db = { academicEvent: { findMany: async () => [] }, examSchedule: { findMany: async () => Promise.reject(new Error("boom")) } } as unknown as ExamDb;
  await assert.rejects(() => next(db), /boom/);
});

// ---- the Indian date ------------------------------------------------------------------------------------------------------------------------------

test("todayInIndia: the date flips at 18:30 UTC (midnight IST), whatever zone this machine is in", () => {
  assert.equal(todayInIndia(new Date("2026-10-16T18:29:59.999Z")), "2026-10-16");
  assert.equal(todayInIndia(new Date("2026-10-16T18:30:00.000Z")), "2026-10-17");
  assert.equal(todayInIndia(new Date("2026-10-16T21:30:00Z")), "2026-10-17"); // 03:00 IST on the 17th
  assert.equal(todayInIndia(new Date("2026-12-31T18:30:00Z")), "2027-01-01");
  assert.equal(todayInIndia(new Date("2028-02-28T18:30:00Z")), "2028-02-29");
});

test("03:00 IST on 17 Oct with an exam on 17 Oct: the exam is TODAY (a UTC server would have said 'Tomorrow')", async () => {
  const db = fakeDb([ev({ title: "Quiz Begins", startDate: "2026-10-17" })]);
  const at = new Date("2026-10-16T21:30:00Z");
  const r = await findNextExamAt(db, ME, at);
  assert.equal(r?.daysUntil, 0);
  assert.equal(r?.status, "today");
  assert.equal(describeDaysUntil(r!.daysUntil), "Today");
});

test("the countdown changes exactly at midnight IST: 23:59 IST on the 16th it is 'Tomorrow', at 00:00 IST on the 17th it is 'Today', at 00:00 IST on the 18th the exam is over", async () => {
  const db = fakeDb([ev({ title: "Quiz Begins", startDate: "2026-10-17" })]);
  assert.equal(describeDaysUntil((await findNextExamAt(db, ME, new Date("2026-10-16T18:29:59Z")))!.daysUntil), "Tomorrow");
  assert.equal(describeDaysUntil((await findNextExamAt(db, ME, new Date("2026-10-16T18:30:00Z")))!.daysUntil), "Today");
  assert.equal(await findNextExamAt(db, ME, new Date("2026-10-17T18:30:00Z")), null);
});
