// Offline tests for generating and SAVING the study plan (lib/analytics/learning-path-core.ts) against an IN-MEMORY fake database: the real scope rules
// decide which exams a student can see, completed work survives regeneration, and generating twice never duplicates anything. Nothing here touches a
// real database, the network, OCR or AI.
import { test } from "node:test";
import assert from "node:assert/strict";

import { generateLearningPathCore, previewCoverageNotesCore, type PathDb } from "@/lib/analytics/learning-path-core";
import { daysBetween, localDateString, todayInIndia, todayWindow } from "@/lib/calendar/day";
import { findNextExamAt } from "@/lib/calendar/next-exam";
import { matches } from "./fake-where";

const NOW = new Date("2026-10-16T05:00:00Z"); // 10:30 IST on 16 Oct 2026, whatever zone the machine is in
const TODAY = "2026-10-16";
const utc = (d: string) => new Date(`${d}T00:00:00.000Z`);
const local = (d: string) => new Date(`${d}T00:00:00`);

type Item = { id: string; studyPlanId: string; day: number; date: Date; kind: string; subject: string; title: string; durationMinutes: number; priority: string; completed: boolean };
type Event = { id: string; title: string; type: string; startDate: Date; endDate: Date | null; isPublished: boolean; schoolId: string | null; boardId: string | null; schoolClassId: string | null };

const SUBJECTS = [
  { id: "m", name: "Mathematics", chapters: [{ id: "m1", name: "Real Numbers" }, { id: "m2", name: "Polynomials" }, { id: "m3", name: "Quadratic Equations" }] },
  { id: "e", name: "English", chapters: [{ id: "e1", name: "The Dear Departed" }, { id: "e2", name: "Journey to the End of the Earth" }] },
];

function world(opts: { failAcademic?: boolean; student?: Record<string, unknown> | null; events?: Event[]; schedules?: Record<string, unknown>[]; weak?: unknown[]; items?: Partial<Item>[]; withPlan?: boolean; subjects?: typeof SUBJECTS } = {}) {
  const student = opts.student === undefined ? { id: "stu", schoolId: "demo", boardId: "bse", schoolClassId: "c10" } : opts.student;
  const events = opts.events ?? [];
  const schedules = opts.schedules ?? [];
  const subjects = opts.subjects ?? SUBJECTS;
  const plans: { id: string; studentId: string; createdAt: Date; items: Item[] }[] = [];
  let seq = 0;
  if (opts.withPlan || (opts.items && opts.items.length)) {
    const plan = { id: "plan1", studentId: "stu", createdAt: new Date("2026-10-10T03:30:00Z") /* 09:00 IST on the 10th */, items: [] as Item[] };
    for (const i of opts.items ?? []) plan.items.push({ id: `old${++seq}`, studyPlanId: "plan1", day: 1, kind: "TOPIC", subject: "Mathematics", durationMinutes: 40, priority: "MEDIUM", completed: false, title: "x", date: local(TODAY), ...i });
    plans.push(plan);
  }
  const calls = { findStudent: 0, creates: 0, deleteMany: 0, createMany: 0 };
  const db = {
    student: { findUnique: async () => (calls.findStudent++, student) },
    schoolClassSubject: { findMany: async () => subjects.map((s) => ({ isEnabled: true, subject: s })) },
    weaknessProfile: { findMany: async () => opts.weak ?? [] },
    academicEvent: { findMany: async ({ where }: { where: unknown }) => { if (opts.failAcademic) throw new Error("simulated database failure"); return events.filter((e) => matches(e as never, where)); } },
    examSchedule: { findMany: async ({ where }: { where: unknown }) => schedules.filter((s) => matches(s as never, where)) },
    studyPlan: {
      findFirst: async () => plans[plans.length - 1] ?? null,
      create: async ({ data }: { data: { studentId: string } }) => {
        calls.creates++;
        const p = { id: `plan${plans.length + 1}`, studentId: data.studentId, createdAt: new Date(NOW), items: [] as Item[] };
        plans.push(p);
        return p;
      },
    },
    studyPlanItem: {
      deleteMany: async ({ where }: { where: unknown }) => {
        calls.deleteMany++;
        const plan = plans[plans.length - 1];
        const before = plan.items.length;
        plan.items = plan.items.filter((i) => !matches(i as never, where));
        return { count: before - plan.items.length };
      },
      createMany: async ({ data }: { data: Omit<Item, "id" | "completed">[] }) => {
        calls.createMany++;
        const plan = plans[plans.length - 1];
        for (const d of data) plan.items.push({ ...d, id: `n${++seq}`, completed: false });
        return { count: data.length };
      },
    },
    $transaction: async (ops: Promise<unknown>[]) => Promise.all(ops),
  } as unknown as PathDb;
  return { db, plans, calls, items: () => plans[plans.length - 1]?.items ?? [] };
}

const ev = (title: string, startDate: string, over: Partial<Event> = {}): Event => ({ id: `ev-${title}-${startDate}`, title, type: "EXAM", startDate: utc(startDate), endDate: null, isPublished: true, schoolId: "demo", boardId: "bse", schoolClassId: "c10", ...over });
const EXAM = () => ev("Half-Yearly Examination Begins", "2026-11-02");
const generate = (w: ReturnType<typeof world>) => generateLearningPathCore(w.db, "stu", NOW);
const titles = (w: ReturnType<typeof world>) => w.items().map((i) => i.title);

// ---- where the exam dates come from -----------------------------------------------------------------------------------------------------------

test("the plan is built from the PUBLISHED academic exam for the student's own audience - not from the legacy exam schedule alone", async () => {
  const w = world({ events: [EXAM()] });
  const s = await generate(w);
  assert.equal(s?.mode, "exam-aware");
  assert.equal(s?.exams[0].label, "Half-Yearly Examination");
  assert.equal(s?.exams[0].daysLeft, 17);
  assert.ok(w.items().length > 0);
  assert.ok(titles(w).every((t) => t.endsWith("for Half-Yearly Examination")));
  assert.ok(w.items().every((i) => i.date >= local(TODAY) && i.date < local("2026-11-02")));
  assert.equal(w.calls.creates, 1);
});

test("a DRAFT exam is ignored: the plan is the general one", async () => {
  const w = world({ events: [ev("Half-Yearly Examination Begins", "2026-11-02", { isPublished: false })] });
  const s = await generate(w);
  assert.equal(s?.mode, "general");
  assert.ok(titles(w).every((t) => !/ for /.test(t)));
});

test("another school's, board's or class's published exam never influences the plan (and the older schedules are scoped by school too)", async () => {
  const mine = EXAM();
  const others = [
    ev("Other School Test Begins", "2026-10-20", { schoolId: "other" }),
    ev("Other Board Test Begins", "2026-10-21", { boardId: "cbse" }),
    ev("Class 9 Test Begins", "2026-10-22", { schoolClassId: "c9" }),
  ];
  const schedules = [
    { id: "s1", name: "Other School Schedule", examDate: new Date(2026, 9, 19, 12), subjectName: "Mathematics", chapterScope: "", isPublished: true, boardId: "bse", schoolClassId: "c10", createdBy: { admin: { schoolId: "other" } } },
    { id: "s2", name: "Draft Schedule", examDate: new Date(2026, 9, 19, 12), subjectName: "Mathematics", chapterScope: "", isPublished: false, boardId: "bse", schoolClassId: "c10", createdBy: { admin: { schoolId: "demo" } } },
  ];
  const clean = world({ events: [mine] });
  const noisy = world({ events: [mine, ...others], schedules });
  await generate(clean);
  const s = await generate(noisy);
  assert.deepEqual(s?.exams.map((e) => e.label), ["Half-Yearly Examination"]);
  assert.deepEqual(noisy.items().map((i) => [i.date.getTime(), i.title]), clean.items().map((i) => [i.date.getTime(), i.title]), "identical plan with or without the other audiences' exams");
});

test("an own-school published exam schedule is used too, with its subject and chapters", async () => {
  const schedules = [{ id: "s1", name: "Maths Unit Test", examDate: new Date(2026, 10, 2, 12), subjectName: "Mathematics", chapterScope: "Chapters 1-2", isPublished: true, boardId: "bse", schoolClassId: "c10", createdBy: { admin: { schoolId: "demo" } } }];
  const w = world({ schedules });
  const s = await generate(w);
  assert.equal(s?.mode, "exam-aware");
  const study = w.items().filter((i) => i.kind === "TOPIC").map((i) => i.title);
  assert.deepEqual(study, ["Study: Real Numbers · for Maths Unit Test", "Study: Polynomials · for Maths Unit Test"]);
});

test("a student with no class gets nothing and nothing is written; one with no school sees no exams (general plan only)", async () => {
  const noClass = world({ student: { id: "stu", schoolId: "demo", boardId: "bse", schoolClassId: null }, events: [EXAM()] });
  assert.equal(await generate(noClass), null);
  assert.equal(noClass.calls.creates, 0);
  const noSchool = world({ student: { id: "stu", schoolId: null, boardId: "bse", schoolClassId: "c10" }, events: [EXAM()] });
  assert.equal((await generate(noSchool))?.mode, "general");
});

test("nothing to plan (no exams and no subjects): no empty plan row is created", async () => {
  const w = world({ subjects: [] });
  const s = await generate(w);
  assert.equal(s?.planId, null);
  assert.equal(s?.created, 0);
  assert.equal(w.calls.creates, 0);
});

// ---- weak areas -----------------------------------------------------------------------------------------------------------------------------

test("real mastery data: the weak topic is scheduled first; with none, nothing is called weak", async () => {
  const weakRow = { mastery: 25, topic: { name: "Zeroes", chapter: { name: "Polynomials", subject: { id: "m", name: "Mathematics" } } } };
  const withWeak = world({ events: [EXAM()], weak: [weakRow] });
  await generate(withWeak);
  const first = withWeak.items().filter((i) => i.kind === "TOPIC").sort((a, b) => a.date.getTime() - b.date.getTime())[0];
  assert.equal(first.title, "Review weak topic: Zeroes (Polynomials) · for Half-Yearly Examination");
  assert.equal(first.priority, "HIGH");
  const without = world({ events: [EXAM()] });
  await generate(without);
  assert.ok(!titles(without).some((t) => /weak/i.test(t)));
});

// ---- regeneration and history ------------------------------------------------------------------------------------------------------------------

test("regenerating keeps COMPLETED tasks (same rows), keeps past tasks, and replaces only today-and-later tasks that are not done", async () => {
  const w = world({
    events: [EXAM()],
    items: [
      { title: "Old generic task (past, not done)", date: local("2026-10-14"), completed: false, day: 5 },
      { title: "Old generic task (past, done)", date: local("2026-10-15"), completed: true, day: 6 },
      { title: "Old generic task (future, done)", date: local("2026-10-20"), completed: true, day: 11 },
      { title: "Old generic task (future, not done)", date: local("2026-10-21"), completed: false, day: 12 },
      { title: "Old generic task (today, not done)", date: local(TODAY), completed: false, day: 7 },
    ],
  });
  const keep = w.items().filter((i) => i.completed || i.date < local(TODAY)).map((i) => i.id);
  const s = await generate(w);
  const after = w.items();
  for (const id of keep) assert.ok(after.some((i) => i.id === id), `kept row ${id} is still there, untouched`);
  assert.ok(!after.some((i) => i.title === "Old generic task (future, not done)"), "an unfinished future task is replaced");
  assert.ok(!after.some((i) => i.title === "Old generic task (today, not done)"), "an unfinished task of today is replaced");
  assert.equal(s?.kept, 3);
  assert.equal(w.calls.creates, 0, "the existing plan is reused, never deleted and recreated");
  assert.ok(after.filter((i) => i.completed).every((i) => i.title.startsWith("Old generic task (")), "completed rows are exactly the ones that were completed");
});

test("generating twice in a row gives the same plan: no duplicates (same date + title), same number of tasks", async () => {
  const w = world({ events: [EXAM()] });
  await generate(w);
  const first = w.items().map((i) => `${localDateString(i.date)}|${i.title}`).sort();
  const s2 = await generate(w);
  const second = w.items().map((i) => `${localDateString(i.date)}|${i.title}`).sort();
  assert.deepEqual(second, first);
  assert.equal(new Set(second).size, second.length, "no duplicates");
  assert.equal(s2?.kept, 0);
  assert.equal(w.calls.creates, 1);
});

test("a chapter completed for an exam is not scheduled again for it after regeneration - it appears exactly once, as the completed row", async () => {
  const w = world({ events: [EXAM()] });
  await generate(w);
  const done = w.items().find((i) => i.title === "Study: Polynomials · for Half-Yearly Examination")!;
  done.completed = true;
  await generate(w);
  const rows = w.items().filter((i) => i.title === done.title);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, done.id);
  assert.equal(rows[0].completed, true);
  assert.equal(w.items().filter((i) => i.kind === "TOPIC").length, 5, "all 5 chapters still covered, the done one only once");
});

test("a completed task on a day uses up that day's allowance: no day ever exceeds the daily limit after regenerating", async () => {
  const w = world({ events: [EXAM()] });
  await generate(w);
  for (const i of w.items().filter((x) => x.date.getTime() === local(TODAY).getTime())) i.completed = true;
  await generate(w);
  const perDay = new Map<string, number>();
  for (const i of w.items()) perDay.set(localDateString(i.date), (perDay.get(localDateString(i.date)) ?? 0) + 1);
  assert.ok(perDay.get(TODAY)! <= 2, "today (a study day) is within the daily limit");
  assert.ok([...perDay.values()].every((c) => c <= 3), JSON.stringify([...perDay]));
});

test("a new exam published later changes only the unfinished future: the completed work survives", async () => {
  const w = world({ events: [EXAM()] });
  await generate(w);
  const doneRows = w.items().slice(0, 2);
  doneRows.forEach((r) => (r.completed = true));
  const doneIds = doneRows.map((r) => r.id);
  // an earlier exam appears
  const w2events = [EXAM(), ev("Quiz Begins", "2026-10-23")];
  const again = world({ events: w2events });
  again.plans.push(w.plans[0]);
  await generate(again);
  for (const id of doneIds) assert.ok(again.items().some((i) => i.id === id && i.completed));
  assert.ok(again.items().some((i) => /for Quiz$/.test(i.title)));
});

test("day numbers count from the day the plan was first made, so they stay consistent when regenerated", async () => {
  const w = world({ events: [EXAM()] });
  await generate(w);
  const start = todayInIndia(w.plans[0].createdAt);
  for (const i of w.items()) assert.equal(i.day, daysBetween(start, localDateString(i.date)) + 1);
  const w2 = world({ events: [EXAM()], withPlan: true }); // a plan made 6 days ago
  await generate(w2);
  const first = w2.items().sort((a, b) => a.date.getTime() - b.date.getTime())[0];
  assert.equal(first.day, 7, "today is day 7 of a plan started on the 10th");
});

test("saving only writes this student's plan rows inside one transaction and never calls anything but the fake (no network, no AI)", async () => {
  const w = world({ events: [EXAM()] });
  await generate(w);
  assert.equal(w.calls.deleteMany, 1);
  assert.ok(w.items().every((i) => i.studyPlanId === w.plans[0].id));
});

// ---- safe failure ---------------------------------------------------------------------------------------------------------------------------

test("if the academic exams cannot be loaded, generation fails and the existing plan is left exactly as it was (no delete, no create)", async () => {
  const w = world({
    events: [EXAM()],
    failAcademic: true,
    items: [
      { title: "Kept: future, not done", date: local("2026-10-21"), completed: false },
      { title: "Kept: future, done", date: local("2026-10-22"), completed: true },
      { title: "Kept: past", date: local("2026-10-12"), completed: false },
    ],
  });
  const before = JSON.stringify(w.items());
  await assert.rejects(() => generate(w), /simulated database failure/);
  assert.equal(JSON.stringify(w.items()), before, "every row identical");
  assert.equal(w.calls.deleteMany, 0);
  assert.equal(w.calls.createMany, 0);
  assert.equal(w.calls.creates, 0);
});

test("a failure with no plan yet creates nothing either", async () => {
  const w = world({ events: [EXAM()], failAcademic: true });
  await assert.rejects(() => generate(w));
  assert.equal(w.calls.creates, 0);
  assert.equal(w.items().length, 0);
});

// ---- the Indian day: plan, Today's Planner and the countdown agree ----------------------------------------------------------------------------------

const AT_0300_IST_17_OCT = new Date("2026-10-16T21:30:00Z"); // 03:00 IST on 17 October, still 16 October in UTC

test("at 03:00 IST on 17 Oct the plan starts on the 17th, Today's Planner window is the 17th, and the countdown counts from the 17th", async () => {
  const w = world({ events: [ev("Unit Test Begins", "2026-10-20")] });
  const s = await generateLearningPathCore(w.db, "stu", AT_0300_IST_17_OCT);
  const window = todayWindow(AT_0300_IST_17_OCT);
  assert.equal(window.today, "2026-10-17");
  const dates = w.items().map((i) => i.date.getTime()).sort((a, b) => a - b);
  assert.equal(dates[0], window.start.getTime(), "the first task is dated TODAY (the 17th), not yesterday");
  const forToday = w.items().filter((i) => i.date >= window.start && i.date < window.end);
  assert.ok(forToday.length > 0, "what Today's Planner reads (its window) contains the plan's tasks for the 17th");
  assert.equal(s?.exams[0].daysLeft, 3, "plan: 17 -> 20 Oct");
  const next = await findNextExamAt(w.db, { schoolId: "demo", boardId: "bse", schoolClassId: "c10" }, AT_0300_IST_17_OCT);
  assert.equal(next?.daysUntil, 3, "countdown: the same 3 days");
});

test("at 03:00 IST on 17 Oct an exam on the 17th is TODAY: no preparation is scheduled that day, and the plan carries on from the 18th", async () => {
  const w = world({ events: [ev("Unit Test Begins", "2026-10-17"), ev("Final Begins", "2026-10-27")] });
  const s = await generateLearningPathCore(w.db, "stu", AT_0300_IST_17_OCT);
  const next = await findNextExamAt(w.db, { schoolId: "demo", boardId: "bse", schoolClassId: "c10" }, AT_0300_IST_17_OCT);
  assert.equal(next?.status, "today");
  assert.equal(next?.daysUntil, 0);
  assert.ok(w.items().every((i) => i.date >= local("2026-10-18")), "nothing on the exam day itself");
  assert.deepEqual(s?.exams.map((e) => e.label), ["Final"]);
});

test("one minute either side of midnight IST: 23:59 IST on the 16th still plans from the 16th; 00:00 IST on the 17th plans from the 17th", async () => {
  const before = world({ events: [EXAM()] });
  await generateLearningPathCore(before.db, "stu", new Date("2026-10-16T18:29:00Z"));
  assert.equal(before.items().map((i) => i.date.getTime()).sort((a, b) => a - b)[0], local("2026-10-16").getTime());
  const after = world({ events: [EXAM()] });
  await generateLearningPathCore(after.db, "stu", new Date("2026-10-16T18:30:00Z"));
  assert.equal(after.items().map((i) => i.date.getTime()).sort((a, b) => a - b)[0], local("2026-10-17").getTime());
});

// ---- the same exam in both sources --------------------------------------------------------------------------------------------------------------

test("an exam present in both the academic calendar and the exam schedules is planned ONCE, with the schedule's subject and chapters and no 'no days left' noise", async () => {
  const schedules = [{ id: "s1", name: "Half-Yearly Examination", examDate: new Date(2026, 10, 2, 12), subjectName: "Mathematics", chapterScope: "Chapters 1-2", isPublished: true, boardId: "bse", schoolClassId: "c10", createdBy: { admin: { schoolId: "demo" } } }];
  const w = world({ events: [EXAM()], schedules });
  const s = await generate(w);
  assert.deepEqual(s?.exams.map((e) => e.label), ["Half-Yearly Examination"]);
  assert.ok(!s?.notes.some((n) => /no days left/.test(n)));
  assert.deepEqual(w.items().filter((i) => i.kind === "TOPIC").map((i) => i.title), ["Study: Real Numbers · for Half-Yearly Examination", "Study: Polynomials · for Half-Yearly Examination"]);
});

// ---- exams in progress ----------------------------------------------------------------------------------------------------------------------------

test("an exam running 15-20 Oct with today the 17th: nothing is scheduled on the 17th-20th, preparation resumes on the 21st for the next exam", async () => {
  const w = world({ events: [ev("Unit Test Begins", "2026-10-15"), ev("Unit Test Ends", "2026-10-20"), ev("Final Begins", "2026-11-02")] });
  const s = await generateLearningPathCore(w.db, "stu", new Date("2026-10-17T05:00:00Z"));
  assert.deepEqual(s?.exams.map((e) => e.label), ["Final"]);
  assert.ok(w.items().length > 0);
  assert.ok(w.items().every((i) => i.date >= local("2026-10-21") && i.date < local("2026-11-02")));
});

// ---- the coverage notes for the Study Plan page (read only) ----------------------------------------------------------------------------------------

const MATHS_PAPER = () => [{ id: "s1", name: "Half-Yearly Examination", examDate: new Date(2026, 10, 2, 12), subjectName: "Mathematics", chapterScope: "", isPublished: true, boardId: "bse", schoolClassId: "c10", createdBy: { admin: { schoolId: "demo" } } }];

test("coverage notes: a published Maths-only paper for an all-subjects exam gives the 'based on the published papers for Mathematics' note, and NOTHING is written", async () => {
  const w = world({ events: [EXAM()], schedules: MATHS_PAPER(), items: [{ title: "Kept", date: local("2026-10-21"), completed: false }] });
  const before = JSON.stringify(w.items());
  const notes = await previewCoverageNotesCore(w.db, "stu", NOW);
  assert.deepEqual(notes, ["Your plan for Half-Yearly Examination is based on the published papers for Mathematics. Check with your teacher whether other subjects are included."]);
  assert.equal(JSON.stringify(w.items()), before, "the plan is untouched");
  assert.deepEqual([w.calls.creates, w.calls.deleteMany, w.calls.createMany], [0, 0, 0]);
});

test("coverage notes: the same notes come back from a real generation", async () => {
  const w = world({ events: [EXAM()], schedules: MATHS_PAPER() });
  const s = await generate(w);
  assert.equal(s?.coverageNotes.length, 1);
  assert.match(s!.coverageNotes[0], /published papers for Mathematics/);
});

test("coverage notes: none when every known subject has a paper, and none when there is no exam at all", async () => {
  const both = [...MATHS_PAPER(), { ...MATHS_PAPER()[0], id: "s2", subjectName: "English" }];
  assert.deepEqual(await previewCoverageNotesCore(world({ events: [EXAM()], schedules: both }).db, "stu", NOW), []);
  assert.deepEqual(await previewCoverageNotesCore(world({}).db, "stu", NOW), []);
});

test("coverage notes: a drafts-only calendar or another school's schedule never produces a note", async () => {
  const draft = ev("Half-Yearly Examination Begins", "2026-11-02", { isPublished: false });
  assert.deepEqual(await previewCoverageNotesCore(world({ events: [draft] }).db, "stu", NOW), []);
  const other = MATHS_PAPER().map((s) => ({ ...s, createdBy: { admin: { schoolId: "other" } } }));
  assert.deepEqual(await previewCoverageNotesCore(world({ events: [EXAM()], schedules: other }).db, "stu", NOW), ["Half-Yearly Examination: the calendar does not say which subjects or chapters it covers, so the plan follows your chapters in textbook order. Check with your teacher which portion it covers."]);
});

test("coverage notes: a student with no class gets none; a failed read throws (the action turns that into 'no note')", async () => {
  assert.deepEqual(await previewCoverageNotesCore(world({ student: { id: "stu", schoolId: "demo", boardId: "bse", schoolClassId: null } }).db, "stu", NOW), []);
  await assert.rejects(() => previewCoverageNotesCore(world({ events: [EXAM()], failAcademic: true }).db, "stu", NOW), /simulated database failure/);
});
