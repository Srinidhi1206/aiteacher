// Offline tests for "a chapter the student has marked done is planned again, later, for revision" (lib/analytics/exam-plan.ts) and for the words the Study Plan page and the dashboard use about
// ticking a task. The engine is pure; saving and regenerating run against an IN-MEMORY fake database (the same shape as tests/learning-path-core.test.ts). No database, network, AI or clock.
// A plan item's identity is its TITLE (there is no link to a chapter row), so "Revise chapter: <chapter> [· for <exam>]" is what tells one chapter's revision from another's.
import { test, mock, before } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { buildStudyPlan, generalStudyTitle, planStaleReason, removedChapterNames, reviseChapterTitle, studyTitle, MAX_REVISION_TASKS_PER_DAY, MAX_TASKS_PER_DAY, REVISION_MINUTES, type PlanInput, type PlanSubject, type PlannedItem } from "@/lib/analytics/exam-plan";
import { generateLearningPathCore, type PathDb } from "@/lib/analytics/learning-path-core";
import { addDays, localDateString } from "@/lib/calendar/day";
import type { ExamItem } from "@/lib/calendar/next-exam";
import { planProgress, taskState } from "@/lib/study-plan/item-status";
import { MARK_DONE_LABEL, MARK_NOT_DONE_LABEL, MARKED_DONE_BADGE, TICK_HELPER_TEXT, markedDoneCount, tickLabel } from "@/lib/study-plan/wording";
import { matches } from "./fake-where";

const TODAY = "2026-10-16";
const SUBJECTS: PlanSubject[] = [
  { id: "m", name: "Mathematics", chapters: [{ id: "m1", name: "Real Numbers" }, { id: "m2", name: "Polynomials" }, { id: "m3", name: "Pair of Linear Equations" }, { id: "m4", name: "Quadratic Equations" }] },
  { id: "s", name: "Physical Science", chapters: [{ id: "s1", name: "Chemical Reactions" }, { id: "s2", name: "Acids, Bases and Salts" }, { id: "s3", name: "Metals and Non-metals" }] },
  { id: "e", name: "English", chapters: [{ id: "e1", name: "The Dear Departed" }, { id: "e2", name: "Journey to the End of the Earth" }] },
];
const ALL_CHAPTERS = SUBJECTS.flatMap((s) => s.chapters.map((c) => c.name));

let n = 0;
const exam = (label: string, startDate: string): ExamItem => ({ id: `x${++n}`, title: `${label} Begins`, label, startDate, endDate: null, source: "calendar", papers: [] });
const input = (over: Partial<PlanInput> = {}): PlanInput => ({ today: TODAY, exams: [], subjects: SUBJECTS, weak: [], completedTitles: new Set(), existingKeys: new Set(), takenByDate: {}, ...over });
const doneFor = (label: string, chapters: string[]) => new Set(chapters.map((c) => studyTitle(c, label)));
const chapterRevisions = (items: PlannedItem[]) => items.filter((i) => i.title.startsWith("Revise chapter: "));
const perDay = (items: PlannedItem[]) => {
  const m = new Map<string, PlannedItem[]>();
  for (const i of items) m.set(i.date, [...(m.get(i.date) ?? []), i]);
  return m;
};
const QUIZ = "Quiz";
const QUIZ_DAY = "2026-10-26"; // 10 days away: study 16-22 Oct, revision 23-25 Oct

// ---- exam-aware plans ------------------------------------------------------------------------------------------------------------------------------------

test("a chapter marked done for an exam gets exactly one later revision task for that exam - before the exam, not today, 30 minutes - and is not studied again", () => {
  const r = buildStudyPlan(input({ exams: [exam(QUIZ, QUIZ_DAY)], completedTitles: doneFor(QUIZ, ["Polynomials"]) }));
  const rev = chapterRevisions(r.items);
  assert.equal(rev.length, 1);
  assert.equal(rev[0].title, reviseChapterTitle("Polynomials", QUIZ));
  assert.equal(rev[0].title, "Revise chapter: Polynomials · for Quiz");
  assert.equal(rev[0].kind, "REVISION");
  assert.equal(rev[0].subject, "Mathematics");
  assert.equal(rev[0].durationMinutes, REVISION_MINUTES);
  assert.ok(rev[0].date > TODAY && rev[0].date < QUIZ_DAY, `planned for a later day before the exam, got ${rev[0].date}`);
  assert.ok(!r.items.some((i) => i.title === studyTitle("Polynomials", QUIZ)), "the done chapter is not studied a second time");
  assert.equal(r.items.filter((i) => i.kind === "TOPIC").length, ALL_CHAPTERS.length - 1, "every other chapter is still to study");
});

test("a chapter with nothing ticked gets no chapter revision; a tick made for ANOTHER exam does not create one for this exam", () => {
  const none = buildStudyPlan(input({ exams: [exam(QUIZ, QUIZ_DAY)] }));
  assert.equal(chapterRevisions(none.items).length, 0);
  const other = buildStudyPlan(input({ exams: [exam(QUIZ, QUIZ_DAY)], completedTitles: doneFor("Some Other Exam", ["Polynomials", "Real Numbers"]) }));
  assert.equal(chapterRevisions(other.items).length, 0);
  assert.equal(other.items.filter((i) => i.kind === "TOPIC").length, ALL_CHAPTERS.length, "nothing was ticked for this exam, so every chapter is still to study");
});

test("a chapter outside the exam's chapter scope is not revised even if the student ticked it", () => {
  const e = { ...exam("Maths Unit Test", QUIZ_DAY), source: "schedule" as const, papers: [{ subjectName: "Mathematics", chapterScope: "Chapters 1-2" }] } as ExamItem;
  const r = buildStudyPlan(input({ exams: [e], completedTitles: doneFor("Maths Unit Test", ["Real Numbers", "Quadratic Equations"]) }));
  assert.deepEqual(chapterRevisions(r.items).map((i) => i.title), ["Revise chapter: Real Numbers · for Maths Unit Test"]);
});

test("a chapter whose revision is already done is not revised again; one still not done is planned again (it is still owed)", () => {
  const done = doneFor(QUIZ, ["Polynomials", "Real Numbers"]);
  done.add(reviseChapterTitle("Polynomials", QUIZ));
  const r = buildStudyPlan(input({ exams: [exam(QUIZ, QUIZ_DAY)], completedTitles: done }));
  assert.deepEqual(chapterRevisions(r.items).map((i) => i.title), ["Revise chapter: Real Numbers · for Quiz"]);
});

test("every chapter marked done is revised: capacity is respected on revision days and on study days, nothing lands on or after the exam day, titles are unique", () => {
  const r = buildStudyPlan(input({ exams: [exam(QUIZ, QUIZ_DAY)], completedTitles: doneFor(QUIZ, ALL_CHAPTERS) }));
  const rev = chapterRevisions(r.items);
  assert.equal(rev.length, ALL_CHAPTERS.length);
  assert.equal(new Set(rev.map((i) => i.title)).size, rev.length, "one revision per chapter");
  assert.ok(r.items.every((i) => i.date >= TODAY && i.date < QUIZ_DAY));
  assert.ok(rev.every((i) => i.date > TODAY), "none on today");
  for (const [date, list] of perDay(r.items)) {
    const cap = list.every((i) => i.kind === "REVISION") ? MAX_REVISION_TASKS_PER_DAY : MAX_TASKS_PER_DAY;
    assert.ok(list.length <= cap, `${date} has ${list.length} tasks, limit ${cap}`);
  }
  assert.equal(r.notes.filter((x) => /could not get a revision day/.test(x)).length, 0, "everything fitted, so nothing is reported as left over");
});

test("what is already on a day (tasks done or kept) counts against that day's limit", () => {
  const takenByDate: Record<string, number> = {};
  for (let d = addDays(TODAY, 1); d < QUIZ_DAY; d = addDays(d, 1)) takenByDate[d] = 1;
  const r = buildStudyPlan(input({ exams: [exam(QUIZ, QUIZ_DAY)], completedTitles: doneFor(QUIZ, ALL_CHAPTERS), takenByDate }));
  for (const [date, list] of perDay(r.items)) {
    const cap = list.every((i) => i.kind === "REVISION") ? MAX_REVISION_TASKS_PER_DAY : MAX_TASKS_PER_DAY;
    assert.ok(list.length + (takenByDate[date] ?? 0) <= cap, `${date}: ${list.length} new + ${takenByDate[date] ?? 0} already there, limit ${cap}`);
  }
});

test("when there is no room left before the exam the chapters that did not fit are SAID, never dropped silently and never squeezed past the daily limit", () => {
  const takenByDate: Record<string, number> = {};
  for (let d = TODAY; d < QUIZ_DAY; d = addDays(d, 1)) takenByDate[d] = 3; // every day is already full
  const r = buildStudyPlan(input({ exams: [exam(QUIZ, QUIZ_DAY)], completedTitles: doneFor(QUIZ, ["Polynomials", "Real Numbers"]), takenByDate }));
  assert.equal(chapterRevisions(r.items).length, 0);
  assert.ok(r.notes.some((x) => /Quiz: 2 chapters you marked done could not get a revision day before it\./.test(x)), JSON.stringify(r.notes));
});

test("a chapter ticked today is never revised today while a later day exists, even when today is the only day with room", () => {
  const takenByDate: Record<string, number> = {};
  for (let d = addDays(TODAY, 1); d < QUIZ_DAY; d = addDays(d, 1)) takenByDate[d] = 3; // every later day is full; today is empty
  const completedTitles = doneFor(QUIZ, ALL_CHAPTERS); // nothing left to study, so today is free
  for (const c of ALL_CHAPTERS.filter((c) => c !== "Polynomials")) completedTitles.add(reviseChapterTitle(c, QUIZ)); // only Polynomials still needs its revision
  const r = buildStudyPlan(input({ exams: [exam(QUIZ, QUIZ_DAY)], completedTitles, takenByDate }));
  assert.equal(chapterRevisions(r.items).length, 0);
  assert.ok(r.notes.some((x) => /1 chapter you marked done could not get a revision day before it/.test(x)), JSON.stringify(r.notes));
});

test("with only today left before the exam, a chapter marked done is revised today (the one day there is) - if the day has room; if its subject revisions fill it, the chapter is reported as left over", () => {
  const oneSubject = input({ subjects: [SUBJECTS[0]], exams: [exam(QUIZ, addDays(TODAY, 1))], completedTitles: doneFor(QUIZ, ["Polynomials"]) });
  const r = buildStudyPlan(oneSubject);
  const rev = chapterRevisions(r.items);
  assert.equal(rev.length, 1);
  assert.equal(rev[0].date, TODAY);
  assert.ok(perDay(r.items).get(TODAY)!.length <= MAX_REVISION_TASKS_PER_DAY);
  const full = buildStudyPlan(input({ exams: [exam(QUIZ, addDays(TODAY, 1))], completedTitles: doneFor(QUIZ, ["Polynomials"]) }));
  assert.equal(chapterRevisions(full.items).length, 0, "three subject revisions already fill the single day");
  assert.ok(full.notes.some((x) => /1 chapter you marked done could not get a revision day before it/.test(x)), JSON.stringify(full.notes));
});

test("a chapter ticked on a weak area is revised at HIGH priority", () => {
  const weak = [{ subjectId: "m", subjectName: "Mathematics", chapterName: "Polynomials", topicName: "Zeroes", mastery: 20 }];
  const r = buildStudyPlan(input({ exams: [exam(QUIZ, "2026-11-10")], weak, completedTitles: doneFor(QUIZ, ["Polynomials", "Real Numbers"]) }));
  const byTitle = new Map(chapterRevisions(r.items).map((i) => [i.title, i]));
  assert.equal(byTitle.get("Revise chapter: Polynomials · for Quiz")?.priority, "HIGH");
  assert.ok(byTitle.has("Revise chapter: Real Numbers · for Quiz"));
});

test("the subject-level 'Revise: <subject>' tasks of the plan are unchanged by chapter revisions", () => {
  const plain = buildStudyPlan(input({ exams: [exam(QUIZ, QUIZ_DAY)] }));
  const ticked = buildStudyPlan(input({ exams: [exam(QUIZ, QUIZ_DAY)], completedTitles: doneFor(QUIZ, ["Polynomials"]) }));
  const subjectRevisions = (r: ReturnType<typeof buildStudyPlan>) => r.items.filter((i) => /^Revise: /.test(i.title)).map((i) => `${i.date}|${i.title}`).sort();
  assert.deepEqual(subjectRevisions(ticked), subjectRevisions(plain));
  assert.equal(subjectRevisions(plain).length, 3);
});

// ---- a chapter ticked in the GENERAL plan, before any exam was published -------------------------------------------------------------------------------------

test("a chapter ticked in the general plan is not new work for an exam: it is not studied again for the exam, and gets one chapter revision for it instead", () => {
  const r = buildStudyPlan(input({ exams: [exam(QUIZ, QUIZ_DAY)], completedTitles: new Set([generalStudyTitle("Polynomials")]) }));
  assert.equal(r.mode, "exam-aware");
  assert.ok(!r.items.some((i) => i.title === studyTitle("Polynomials", QUIZ)), "not studied again for the exam");
  assert.equal(r.items.filter((i) => i.kind === "TOPIC").length, ALL_CHAPTERS.length - 1);
  const rev = chapterRevisions(r.items);
  assert.deepEqual(rev.map((i) => i.title), ["Revise chapter: Polynomials · for Quiz"]);
  assert.ok(rev[0].date > TODAY && rev[0].date < QUIZ_DAY);
});

test("ticked both in the general plan and for the exam: still exactly one revision; a general tick on a chapter outside the exam's scope does nothing", () => {
  const both = buildStudyPlan(input({ exams: [exam(QUIZ, QUIZ_DAY)], completedTitles: new Set([generalStudyTitle("Polynomials"), studyTitle("Polynomials", QUIZ)]) }));
  assert.equal(chapterRevisions(both.items).length, 1);
  const e = { ...exam("Maths Unit Test", QUIZ_DAY), source: "schedule" as const, papers: [{ subjectName: "Mathematics", chapterScope: "Chapters 1-2" }] } as ExamItem;
  const scoped = buildStudyPlan(input({ exams: [e], completedTitles: new Set([generalStudyTitle("Quadratic Equations"), generalStudyTitle("Real Numbers")]) }));
  assert.deepEqual(chapterRevisions(scoped.items).map((i) => i.title), ["Revise chapter: Real Numbers · for Maths Unit Test"]);
});

test("a chapter revision done in the general plan does not stand in for the exam's revision: the exam still gets its one revision task for that chapter", () => {
  const r = buildStudyPlan(input({ exams: [exam(QUIZ, QUIZ_DAY)], completedTitles: new Set([generalStudyTitle("Polynomials"), reviseChapterTitle("Polynomials")]) }));
  assert.deepEqual(chapterRevisions(r.items).map((i) => i.title), ["Revise chapter: Polynomials · for Quiz"]);
});

test("a general-plan tick counts only for its own chapter, and an exam tick does not leak into the general plan", () => {
  const r = buildStudyPlan(input({ exams: [exam(QUIZ, QUIZ_DAY)], completedTitles: new Set([generalStudyTitle("Polynomials")]) }));
  assert.ok(r.items.some((i) => i.title === studyTitle("Real Numbers", QUIZ)), "other chapters are still to study");
  const general = buildStudyPlan(input({ completedTitles: doneFor(QUIZ, ["Polynomials"]) }));
  assert.equal(chapterRevisions(general.items).length, 0, "a tick made for an exam is not a general-plan tick");
});

// ---- general plans (no exam published) -------------------------------------------------------------------------------------------------------------------

test("general plan: a chapter marked done takes a revision day; mock-test days are untouched; it is not studied again", () => {
  const plain = buildStudyPlan(input());
  const r = buildStudyPlan(input({ completedTitles: new Set(["Study: Real Numbers"]) }));
  assert.equal(r.mode, "general");
  const rev = chapterRevisions(r.items);
  assert.deepEqual(rev.map((i) => i.title), ["Revise chapter: Real Numbers"]);
  assert.equal(rev[0].kind, "REVISION");
  assert.equal(rev[0].durationMinutes, REVISION_MINUTES);
  assert.ok(rev[0].date > TODAY);
  assert.ok(!r.items.some((i) => i.title === "Study: Real Numbers"));
  assert.equal(r.items.filter((i) => i.kind === "MOCK_TEST").length, plain.items.filter((i) => i.kind === "MOCK_TEST").length, "mock tests are kept");
});

test("general plan: more done chapters than revision days can hold are said to be waiting for the next time the plan is generated, and no day goes over its limit", () => {
  const r = buildStudyPlan(input({ completedTitles: new Set(ALL_CHAPTERS.map((c) => `Study: ${c}`)) }));
  const rev = chapterRevisions(r.items);
  assert.ok(rev.length > 0 && rev.length < ALL_CHAPTERS.length, `${rev.length} fitted`);
  assert.ok(r.notes.some((x) => new RegExp(`${ALL_CHAPTERS.length - rev.length} chapters? you marked done (is|are) waiting for a revision day`).test(x)), JSON.stringify(r.notes));
  for (const [date, list] of perDay(r.items)) {
    const cap = list.every((i) => i.kind === "REVISION") ? MAX_REVISION_TASKS_PER_DAY : MAX_TASKS_PER_DAY;
    assert.ok(list.length <= cap, `${date}: ${list.length} > ${cap}`);
  }
});

test("general plan: a chapter whose revision is done is not revised again", () => {
  const r = buildStudyPlan(input({ completedTitles: new Set(["Study: Real Numbers", reviseChapterTitle("Real Numbers"), "Study: Polynomials"]) }));
  assert.deepEqual(chapterRevisions(r.items).map((i) => i.title), ["Revise chapter: Polynomials"]);
});

// ---- the plan is stale, and says so, until the revision is in it ------------------------------------------------------------------------------------------

test("an existing plan that lacks the revision of a chapter the student has since ticked is reported as out of date; one that has it is not", () => {
  const r = buildStudyPlan(input({ exams: [exam(QUIZ, QUIZ_DAY)], completedTitles: doneFor(QUIZ, ["Polynomials"]) }));
  const without = r.items.filter((i) => !i.title.startsWith("Revise chapter: ")).map((i) => i.title);
  assert.match(planStaleReason(without, true, r) ?? "", /does not include revision for the chapters you have marked done yet/);
  assert.equal(planStaleReason(r.items.map((i) => i.title), true, r), null);
});

test("old plans stay readable: subject-level 'Revise: <subject>' and 'Study: ...' titles are understood, and 'Revise chapter:' titles are recognised for removed chapters", () => {
  const known = { chapters: ALL_CHAPTERS, subjects: SUBJECTS.map((s) => s.name) };
  // an old plan: no chapter-level titles at all
  const oldPlan = ["Study: Real Numbers · for Quiz", "Revise: Mathematics · for Quiz"];
  const r = buildStudyPlan(input({ exams: [exam(QUIZ, QUIZ_DAY)] }));
  assert.equal(planStaleReason(r.items.map((i) => i.title), true, r), null, "an up-to-date plan with no ticks is not stale");
  assert.deepEqual(removedChapterNames(oldPlan, known), []);
  // a chapter that is no longer in the curriculum is found whichever kind of title mentions it
  assert.deepEqual(removedChapterNames(["Revise chapter: Gone Chapter · for Quiz"], known), ["Gone Chapter"]);
  assert.deepEqual(removedChapterNames(["Revise chapter: Polynomials · for Quiz", "Revise chapter: Polynomials"], known), []);
});

// ---- saving and regenerating -------------------------------------------------------------------------------------------------------------------------------

const NOW = new Date("2026-10-16T05:00:00Z"); // 10:30 IST on 16 Oct 2026, whatever zone the machine is in
const local = (d: string) => new Date(`${d}T00:00:00`);
const utc = (d: string) => new Date(`${d}T00:00:00.000Z`);
type Item = { id: string; studyPlanId: string; day: number; date: Date; kind: string; subject: string; title: string; durationMinutes: number; priority: string; completed: boolean };

function world(items: Partial<Item>[] = []) {
  const studentId = "stu";
  const plans: { id: string; studentId: string; createdAt: Date; items: Item[] }[] = [];
  // a second student with a completed tick of their own: it must never reach the first student's plan
  plans.push({ id: "other-plan", studentId: "someone-else", createdAt: new Date("2026-10-10T03:30:00Z"), items: [{ id: "o1", studyPlanId: "other-plan", day: 1, date: local("2026-10-14"), kind: "TOPIC", subject: "Mathematics", title: studyTitle("Polynomials", "Half-Yearly Examination"), durationMinutes: 40, priority: "MEDIUM", completed: true }] });
  let seq = 0;
  if (items.length) plans.push({ id: "plan-stu", studentId, createdAt: new Date("2026-10-10T03:30:00Z") /* 09:00 IST on the 10th */, items: items.map((i) => ({ id: `old${++seq}`, studyPlanId: "plan-stu", day: 1, kind: "TOPIC", subject: "Mathematics", durationMinutes: 40, priority: "MEDIUM", completed: false, title: "x", date: local(TODAY), ...i })) });
  const events = [{ id: "ev1", title: "Half-Yearly Examination Begins", type: "EXAM", startDate: utc("2026-11-02"), endDate: null, isPublished: true, schoolId: "demo", boardId: "bse", schoolClassId: "c10" }];
  const mine = () => plans.filter((p) => p.studentId === studentId);
  const db = {
    student: { findUnique: async () => ({ id: studentId, schoolId: "demo", boardId: "bse", schoolClassId: "c10" }) },
    schoolClassSubject: { findMany: async () => SUBJECTS.map((s) => ({ isEnabled: true, subject: s })) },
    weaknessProfile: { findMany: async () => [] },
    academicEvent: { findMany: async ({ where }: { where: unknown }) => events.filter((e) => matches(e as never, where)) },
    examSchedule: { findMany: async () => [] },
    studyPlan: {
      findFirst: async ({ where }: { where: { studentId: string } }) => plans.filter((p) => p.studentId === where.studentId).pop() ?? null,
      create: async ({ data }: { data: { studentId: string } }) => {
        const p = { id: `plan-${data.studentId}`, studentId: data.studentId, createdAt: new Date(NOW), items: [] as Item[] };
        plans.push(p);
        return p;
      },
    },
    studyPlanItem: {
      deleteMany: async ({ where }: { where: { studyPlanId: string } }) => {
        const plan = plans.find((p) => p.id === where.studyPlanId)!;
        const before = plan.items.length;
        plan.items = plan.items.filter((i) => !matches(i as never, where));
        return { count: before - plan.items.length };
      },
      createMany: async ({ data }: { data: Omit<Item, "id" | "completed">[] }) => {
        const plan = plans.find((p) => p.id === data[0]?.studyPlanId)!;
        for (const d of data) plan.items.push({ ...d, id: `n${++seq}`, completed: false });
        return { count: data.length };
      },
    },
    $transaction: async (ops: Promise<unknown>[]) => Promise.all(ops),
  } as unknown as PathDb;
  return { db, items: () => mine()[0]?.items ?? [], other: () => plans.find((p) => p.id === "other-plan")! };
}
const EX = "Half-Yearly Examination";
const gen = (w: ReturnType<typeof world>) => generateLearningPathCore(w.db, "stu", NOW);
const row = (w: ReturnType<typeof world>, title: string) => w.items().filter((i) => i.title === title);
const keyOf = (i: Item) => `${localDateString(i.date)}|${i.title}`;

test("regeneration after ticking a chapter: the ticked row is kept untouched, ONE unfinished revision row is added for a later day, and the chapter is not studied again", async () => {
  const w = world();
  await gen(w);
  const study = row(w, studyTitle("Polynomials", EX))[0];
  study.completed = true;
  const studyId = study.id;
  await gen(w);
  assert.equal(row(w, studyTitle("Polynomials", EX)).length, 1);
  assert.equal(row(w, studyTitle("Polynomials", EX))[0].id, studyId);
  assert.equal(row(w, studyTitle("Polynomials", EX))[0].completed, true);
  const rev = row(w, reviseChapterTitle("Polynomials", EX));
  assert.equal(rev.length, 1);
  assert.equal(rev[0].completed, false);
  assert.equal(rev[0].kind, "REVISION");
  assert.ok(localDateString(rev[0].date) > TODAY && localDateString(rev[0].date) < "2026-11-02");
});

test("regenerating repeatedly never duplicates a revision task (same date + title, same set every time)", async () => {
  const w = world();
  await gen(w);
  row(w, studyTitle("Polynomials", EX))[0].completed = true;
  row(w, studyTitle("Real Numbers", EX))[0].completed = true;
  await gen(w);
  const first = w.items().map(keyOf).sort();
  for (let i = 0; i < 3; i++) await gen(w);
  const again = w.items().map(keyOf).sort();
  assert.deepEqual(again, first);
  assert.equal(new Set(again).size, again.length, "no duplicates");
  assert.equal(w.items().filter((i) => i.title.startsWith("Revise chapter: ")).length, 2);
});

test("a revision task the student ticked is kept and not planned again; the plan then holds exactly one row for it", async () => {
  const w = world();
  await gen(w);
  row(w, studyTitle("Polynomials", EX))[0].completed = true;
  await gen(w);
  const rev = row(w, reviseChapterTitle("Polynomials", EX))[0];
  rev.completed = true;
  const id = rev.id;
  await gen(w);
  const rows = row(w, reviseChapterTitle("Polynomials", EX));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, id);
  assert.equal(rows[0].completed, true);
});

test("a revision task that was missed (its day passed, not done) stays as history and is planned again for a later day", async () => {
  const w = world();
  await gen(w);
  row(w, studyTitle("Polynomials", EX))[0].completed = true;
  await gen(w);
  const rev = row(w, reviseChapterTitle("Polynomials", EX))[0];
  const missedId = rev.id;
  rev.date = local("2026-10-14"); // its day has gone and it was not done
  await gen(w);
  const rows = row(w, reviseChapterTitle("Polynomials", EX));
  assert.equal(rows.length, 2);
  assert.ok(rows.some((r) => r.id === missedId && localDateString(r.date) === "2026-10-14" && !r.completed), "the missed row is history");
  assert.ok(rows.some((r) => r.id !== missedId && localDateString(r.date) >= TODAY), "a fresh one is planned for today or later");
});

test("un-ticking a chapter: its unfinished revision task is removed on the next regeneration and the chapter is to be studied again", async () => {
  const w = world();
  await gen(w);
  row(w, studyTitle("Polynomials", EX))[0].completed = true;
  await gen(w);
  assert.equal(row(w, reviseChapterTitle("Polynomials", EX)).length, 1);
  row(w, studyTitle("Polynomials", EX))[0].completed = false; // the student un-ticks it
  await gen(w);
  assert.equal(row(w, reviseChapterTitle("Polynomials", EX)).length, 0);
  assert.equal(row(w, studyTitle("Polynomials", EX)).length, 1);
});

test("regeneration keeps every completed row exactly as it was and never exceeds a day's limit with the revision tasks added", async () => {
  const w = world();
  await gen(w);
  for (const i of w.items().filter((x) => x.kind === "TOPIC").slice(0, 4)) i.completed = true;
  const doneBefore = w.items().filter((i) => i.completed).map((i) => `${i.id}|${i.title}|${keyOf(i)}`).sort();
  await gen(w);
  const doneAfter = w.items().filter((i) => i.completed).map((i) => `${i.id}|${i.title}|${keyOf(i)}`).sort();
  assert.deepEqual(doneAfter, doneBefore);
  const days = new Map<string, Item[]>();
  for (const i of w.items()) days.set(localDateString(i.date), [...(days.get(localDateString(i.date)) ?? []), i]);
  for (const [date, list] of days) {
    const cap = list.every((i) => i.kind === "REVISION") ? MAX_REVISION_TASKS_PER_DAY : MAX_TASKS_PER_DAY;
    assert.ok(list.length <= cap, `${date}: ${list.length} > ${cap}`);
  }
});

test("student isolation: another student's ticks never create revision tasks in this student's plan", async () => {
  const w = world();
  await gen(w);
  assert.equal(w.items().filter((i) => i.title.startsWith("Revise chapter: ")).length, 0, "the other student ticked Polynomials; this student did not");
  assert.equal(row(w, studyTitle("Polynomials", EX)).length, 1, "and it is still to study here");
  assert.equal(w.other().items.length, 1, "the other student's plan is untouched");
});

test("a chapter ticked in the general plan, then an exam is published: the ticked row is kept untouched, no 'for exam' study row appears for it, ONE chapter revision is planned later", async () => {
  const w = world([
    { id: "tick", title: generalStudyTitle("Polynomials"), date: local("2026-10-13"), completed: true, day: 4 },
    { title: generalStudyTitle("Real Numbers"), date: local("2026-10-14"), completed: false, day: 5 }, // missed, never ticked
  ]);
  await gen(w);
  const orig = w.items().filter((i) => i.title === generalStudyTitle("Polynomials"));
  assert.equal(orig.length, 1);
  assert.equal(orig[0].id, "tick");
  assert.equal(orig[0].completed, true);
  assert.equal(localDateString(orig[0].date), "2026-10-13");
  assert.equal(row(w, studyTitle("Polynomials", EX)).length, 0, "not studied again for the exam");
  const rev = row(w, reviseChapterTitle("Polynomials", EX));
  assert.equal(rev.length, 1);
  assert.equal(rev[0].kind, "REVISION");
  assert.ok(localDateString(rev[0].date) > TODAY && localDateString(rev[0].date) < "2026-11-02");
  assert.equal(row(w, studyTitle("Real Numbers", EX)).length, 1, "a chapter that was only planned (and missed) is still studied for the exam");
  assert.equal(row(w, generalStudyTitle("Real Numbers")).length, 1, "and its missed row stays as history");
});

test("same-day regeneration: a chapter ticked TODAY is revised on a later day, never today; regenerating again the same day changes nothing", async () => {
  const w = world([{ id: "today-tick", title: studyTitle("Polynomials", EX), date: local(TODAY), completed: true, day: 7 }]);
  await gen(w);
  const first = w.items().map(keyOf).sort();
  const rev = row(w, reviseChapterTitle("Polynomials", EX));
  assert.equal(rev.length, 1);
  assert.ok(localDateString(rev[0].date) > TODAY, `revision on ${localDateString(rev[0].date)}, after today`);
  assert.equal(row(w, studyTitle("Polynomials", EX))[0].id, "today-tick", "today's ticked row is kept");
  await gen(w);
  await gen(w);
  assert.deepEqual(w.items().map(keyOf).sort(), first, "the same day again gives the same plan");
});

test("same-day rule in the general plan (no exam): a chapter ticked today is revised on a later day, never today, and the same inputs give the same plan", () => {
  const completedTitles = () => new Set([generalStudyTitle("Real Numbers")]);
  const r = buildStudyPlan(input({ completedTitles: completedTitles() }));
  const rev = chapterRevisions(r.items);
  assert.equal(rev.length, 1);
  assert.ok(rev[0].date > TODAY);
  assert.deepEqual(buildStudyPlan(input({ completedTitles: completedTitles() })).items, r.items, "deterministic for the same inputs");
});

test("missed revision history is preserved: the missed row stays exactly as it was (same id, day, not done) through repeated regenerations, and exactly one fresh row is planned each time - no pile-up", async () => {
  const w = world([
    { id: "tick", title: studyTitle("Polynomials", EX), date: local("2026-10-12"), completed: true, day: 3 },
    { id: "missed", title: reviseChapterTitle("Polynomials", EX), date: local("2026-10-14"), completed: false, kind: "REVISION", day: 5 },
  ]);
  await gen(w);
  const future = () => row(w, reviseChapterTitle("Polynomials", EX)).filter((i) => i.id !== "missed");
  assert.equal(future().length, 1);
  const plannedFor = localDateString(future()[0].date);
  for (let k = 0; k < 4; k++) await gen(w);
  const missed = row(w, reviseChapterTitle("Polynomials", EX)).filter((i) => i.id === "missed");
  assert.equal(missed.length, 1);
  assert.equal(missed[0].completed, false, "a missed task is not turned into a done one");
  assert.equal(localDateString(missed[0].date), "2026-10-14", "and is not moved");
  assert.equal(future().length, 1, "one fresh revision, not one per regeneration");
  assert.equal(localDateString(future()[0].date), plannedFor, "on the same day each time");
  assert.equal(row(w, reviseChapterTitle("Polynomials", EX)).length, 2);
});

test("a missed revision that the student later ticks counts as done: the fresh unfinished one is removed and no more are planned", async () => {
  const w = world([
    { id: "tick", title: studyTitle("Polynomials", EX), date: local("2026-10-12"), completed: true, day: 3 },
    { id: "missed", title: reviseChapterTitle("Polynomials", EX), date: local("2026-10-14"), completed: false, kind: "REVISION", day: 5 },
  ]);
  await gen(w);
  assert.equal(row(w, reviseChapterTitle("Polynomials", EX)).length, 2);
  row(w, reviseChapterTitle("Polynomials", EX)).find((i) => i.id === "missed")!.completed = true; // the student ticks it late
  await gen(w);
  const rows = row(w, reviseChapterTitle("Polynomials", EX));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, "missed");
  assert.equal(rows[0].completed, true);
});

test("date and status stay distinct for revision rows: a past not-done one is Missed, a later one Upcoming, a ticked one Done, today's is Today - and the counts add up", async () => {
  const w = world([
    { id: "tick", title: studyTitle("Polynomials", EX), date: local("2026-10-12"), completed: true, day: 3 },
    { id: "missed", title: reviseChapterTitle("Polynomials", EX), date: local("2026-10-14"), completed: false, kind: "REVISION", day: 5 },
  ]);
  await gen(w);
  const asTask = (i: Item) => ({ completed: i.completed, dateKey: localDateString(i.date), id: i.id });
  const missed = asTask(row(w, reviseChapterTitle("Polynomials", EX)).find((i) => i.id === "missed")!);
  const fresh = asTask(row(w, reviseChapterTitle("Polynomials", EX)).find((i) => i.id !== "missed")!);
  const ticked = asTask(row(w, studyTitle("Polynomials", EX))[0]);
  assert.equal(taskState(missed, TODAY), "missed");
  assert.equal(taskState(fresh, TODAY), "upcoming");
  assert.equal(taskState(ticked, TODAY), "done");
  assert.equal(taskState({ completed: false, dateKey: TODAY }, TODAY), "today");
  const all = w.items().map(asTask);
  const p = planProgress(all, TODAY);
  assert.equal(p.total, all.length);
  assert.equal(p.done + p.missed + p.ahead, p.total);
  assert.equal(p.missed, 1, "only the one revision whose day passed is missed");
  assert.equal(p.done, 1);
});

test("chapters ticked in a general plan: after repeated regenerations every revision is before the exam day and after today, and no day goes over its limit", async () => {
  const chapters = ["Real Numbers", "Polynomials", "Pair of Linear Equations", "Quadratic Equations", "Chemical Reactions", "The Dear Departed"];
  const w = world(chapters.map((c, i) => ({ title: generalStudyTitle(c), date: local(addDays("2026-10-09", i)), completed: true, day: i + 1 })));
  for (let k = 0; k < 3; k++) await gen(w);
  const revs = w.items().filter((i) => i.title.startsWith("Revise chapter: "));
  assert.equal(revs.length, 6);
  assert.ok(revs.every((i) => localDateString(i.date) > TODAY && localDateString(i.date) < "2026-11-02"));
  assert.equal(new Set(revs.map((i) => i.title)).size, 6, "one revision per chapter");
  const days = new Map<string, Item[]>();
  for (const i of w.items()) days.set(localDateString(i.date), [...(days.get(localDateString(i.date)) ?? []), i]);
  for (const [date, list] of days) {
    const cap = list.every((i) => i.kind === "REVISION") ? MAX_REVISION_TASKS_PER_DAY : MAX_TASKS_PER_DAY;
    assert.ok(list.length <= cap, `${date}: ${list.length} > ${cap}`);
  }
});

// ---- the words about ticking ------------------------------------------------------------------------------------------------------------------------------

const here = (p: string) => new URL(`../${p}`, import.meta.url).href;
(globalThis as unknown as { React: typeof React }).React = React;
mock.module("next/navigation", { namedExports: { useRouter: () => ({ push() {}, replace() {}, refresh() {}, back() {} }) } });
mock.module(here("lib/actions/analytics.ts"), { namedExports: { completeLearningPathItem: async () => ({ ok: true }), getMyLearningPath: async () => null, getMyWeakAreas: async () => [] } });
mock.module(here("lib/actions/planner.ts"), { namedExports: { setPlannerTaskStatus: async () => ({ ok: true }) } });
mock.module(here("components/dashboard/generate-learning-path-button.tsx"), { namedExports: { GenerateLearningPathButton: () => React.createElement("button", null, "Generate my learning path") } });

let View: typeof import("@/components/study-plan/real-learning-path-view").RealLearningPathView;
let TaskRow: typeof import("@/components/dashboard/real-planner-task").RealPlannerTaskRow;
before(async () => {
  View = (await import("@/components/study-plan/real-learning-path-view")).RealLearningPathView;
  TaskRow = (await import("@/components/dashboard/real-planner-task")).RealPlannerTaskRow;
});
const text = (h: string) => h.replace(/<[^>]+>/g, " ").replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/\s+/g, " ").trim();
const planItem = (id: string, completed: boolean, title: string) => ({ id, studyPlanId: "p", day: 1, date: new Date(), dateKey: addDays(TODAY, 3), kind: "TOPIC", subject: "Mathematics", title, durationMinutes: 40, priority: "MEDIUM", completed });
const renderPlan = (items: ReturnType<typeof planItem>[]) => renderToStaticMarkup(React.createElement(View, { learningPath: { id: "p", studentId: "s", createdAt: new Date(), items } as never, weakAreas: [], planNotes: [], subjectLinks: {} }));

test("the Study Plan page calls a tick the student's own check: labels, counts and helper text (and no longer says 'complete')", () => {
  const h = renderPlan([planItem("a", true, "Study: Done chapter"), planItem("b", false, "Study: Open chapter"), planItem("c", false, "Study: Another chapter")]);
  const t = text(h);
  assert.match(t, /1 of 3 marked done by you/);
  assert.match(t, /33% marked done/);
  assert.ok(!/% complete|items done|Mark complete|Mark incomplete/.test(h), "the old wording is gone");
  assert.ok(t.includes(TICK_HELPER_TEXT), "the helper text is shown");
  assert.match(TICK_HELPER_TEXT, /your own record/);
  assert.match(TICK_HELPER_TEXT, /exams and practice/);
  assert.match(TICK_HELPER_TEXT, /revision/);
  const labels = [...h.matchAll(/aria-label="([^"]*)"/g)].map((m) => m[1].replace(/&#x27;/g, "'"));
  assert.deepEqual(labels.sort(), [`${MARK_DONE_LABEL}: Study: Another chapter`, `${MARK_DONE_LABEL}: Study: Open chapter`, `${MARK_NOT_DONE_LABEL}: Study: Done chapter`].sort(), "each button names its action AND its task, and the names are all different");
  assert.ok(!/aria-pressed/.test(h), "the name carries the state, so there is no aria-pressed to announce it a second time");
});

test("the count wording is one place: 'N of M marked done by you'", () => {
  assert.equal(markedDoneCount(0, 0), "0 of 0 marked done by you");
  assert.equal(markedDoneCount(5, 12), "5 of 12 marked done by you");
  assert.equal(MARKED_DONE_BADGE, "Marked done");
});

test("the dashboard's plan rows keep their labels (action + task) with no aria-pressed; the student's own to-dos keep aria-pressed and their own name", () => {
  const plan = renderToStaticMarkup(React.createElement(TaskRow, { id: "p1", title: "Study: Polynomials", done: false, source: "plan" }));
  assert.match(plan, /aria-label="Mark as done \(your own check\): Study: Polynomials"/);
  assert.ok(!/aria-pressed/.test(plan));
  const ticked = renderToStaticMarkup(React.createElement(TaskRow, { id: "p2", title: "Study: Polynomials", done: true, source: "plan" }));
  assert.match(ticked, /aria-label="Mark as not done: Study: Polynomials"/);
  assert.ok(!/aria-pressed/.test(ticked));
  const todo = renderToStaticMarkup(React.createElement(TaskRow, { id: "t1", title: "Buy a geometry box", done: false }));
  assert.ok(!/aria-label/.test(todo), "a student's own to-do is named by its text");
  assert.match(todo, /aria-pressed="false"/);
  assert.match(renderToStaticMarkup(React.createElement(TaskRow, { id: "t2", title: "Buy a geometry box", done: true })), /aria-pressed="true"/);
});

test("the Study Plan and the dashboard build the tick label the same way, and it changes with the state", () => {
  assert.equal(tickLabel(false, "Study: Real Numbers"), "Mark as done (your own check): Study: Real Numbers");
  assert.equal(tickLabel(true, "Study: Real Numbers"), "Mark as not done: Study: Real Numbers");
  const view = renderPlan([planItem("x", false, "Study: Real Numbers")]);
  const dash = renderToStaticMarkup(React.createElement(TaskRow, { id: "x", title: "Study: Real Numbers", done: false, source: "plan" }));
  assert.ok(view.includes(`aria-label="${tickLabel(false, "Study: Real Numbers")}"`));
  assert.ok(dash.includes(`aria-label="${tickLabel(false, "Study: Real Numbers")}"`));
});
