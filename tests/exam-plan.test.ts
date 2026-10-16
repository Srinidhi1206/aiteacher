// Offline tests for the exam-aware scheduler (lib/analytics/exam-plan.ts): pure logic, so no database, clock, network or AI is involved.
import { test } from "node:test";
import assert from "node:assert/strict";

import { buildStudyPlan, MAX_TASKS_PER_DAY, MAX_REVISION_TASKS_PER_DAY, EXAM_HORIZON_DAYS, revisionDaysFor, type PlanInput, type PlanSubject, type PlanWeak, type PlannedItem } from "@/lib/analytics/exam-plan";
import { addDays, daysBetween, type ExamItem } from "@/lib/calendar/next-exam";

const TODAY = "2026-10-16";
const SUBJECTS: PlanSubject[] = [
  { id: "m", name: "Mathematics", chapters: [{ id: "m1", name: "Real Numbers" }, { id: "m2", name: "Polynomials" }, { id: "m3", name: "Pair of Linear Equations" }, { id: "m4", name: "Quadratic Equations" }] },
  { id: "s", name: "Physical Science", chapters: [{ id: "s1", name: "Chemical Reactions" }, { id: "s2", name: "Acids, Bases and Salts" }, { id: "s3", name: "Metals and Non-metals" }] },
  { id: "e", name: "English", chapters: [{ id: "e1", name: "The Dear Departed" }, { id: "e2", name: "Journey to the End of the Earth" }] },
];
const UNITS = 4 + 3 + 2; // every chapter above

let n = 0;
const exam = (title: string, startDate: string, over: Partial<ExamItem> = {}): ExamItem => ({
  id: `x${++n}`,
  title,
  label: title.replace(/ Begins$/, ""),
  startDate,
  endDate: null,
  source: "calendar",
  papers: [],
  ...over,
});
const input = (over: Partial<PlanInput> = {}): PlanInput => ({ today: TODAY, exams: [], subjects: SUBJECTS, weak: [], completedTitles: new Set(), existingKeys: new Set(), takenByDate: {}, ...over });
const byDate = (items: PlannedItem[]) => {
  const m = new Map<string, PlannedItem[]>();
  for (const i of items) m.set(i.date, [...(m.get(i.date) ?? []), i]);
  return m;
};

// ---- exam-aware scheduling and days remaining ----------------------------------------------------------------------------------------------

test("an exam 10 days away: study days first, the last 3 days are revision, nothing on or after the exam day, every chapter is covered", () => {
  const e = exam("Half-Yearly Examination Begins", "2026-10-26");
  const r = buildStudyPlan(input({ exams: [e] }));
  assert.equal(r.mode, "exam-aware");
  assert.deepEqual(r.exams, [{ label: "Half-Yearly Examination", startDate: "2026-10-26", daysLeft: 10 }]);
  assert.ok(r.items.every((i) => i.date >= TODAY && i.date < e.startDate), "every task is before the exam day");
  const days = byDate(r.items);
  for (const [, list] of days) assert.ok(list.length <= (list.every((i) => i.kind === "REVISION") ? MAX_REVISION_TASKS_PER_DAY : MAX_TASKS_PER_DAY), "a day stays manageable");
  // days 23, 24, 25 Oct are revision (the 3 days before the exam), earlier days are study
  for (const d of ["2026-10-23", "2026-10-24", "2026-10-25"]) assert.ok(days.get(d)?.every((i) => i.kind === "REVISION"), `${d} is revision`);
  for (const d of ["2026-10-16", "2026-10-18", "2026-10-22"]) assert.ok(days.get(d)?.every((i) => i.kind === "TOPIC"), `${d} is study`);
  const study = r.items.filter((i) => i.kind === "TOPIC");
  assert.equal(study.length, UNITS);
  assert.equal(new Set(study.map((i) => i.title)).size, UNITS, "each chapter once");
  for (const i of r.items) assert.match(i.title, /for Half-Yearly Examination$/);
  assert.equal(r.unscheduled, 0);
});

test("revision: each subject gets a short task, weak subjects first, spread over the revision days", () => {
  const e = exam("Quiz Begins", "2026-10-26");
  const weak: PlanWeak[] = [{ subjectId: "e", subjectName: "English", chapterName: "The Dear Departed", topicName: "Tenses", mastery: 30 }];
  const r = buildStudyPlan(input({ exams: [e], weak }));
  const rev = r.items.filter((i) => i.kind === "REVISION");
  assert.equal(rev.length, 3);
  assert.deepEqual(new Set(rev.map((i) => i.subject)), new Set(["English", "Mathematics", "Physical Science"]));
  assert.equal(rev[0].subject, "English", "the weak subject is revised first");
  assert.equal(rev[0].priority, "HIGH");
  assert.ok(rev.every((i) => i.durationMinutes === 30));
});

test("the closer the exam, the higher the priority of its tasks (within 7 days is HIGH)", () => {
  const r = buildStudyPlan(input({ exams: [exam("Quiz Begins", "2026-11-05")] }));
  const early = r.items.find((i) => i.date === "2026-10-16")!; // 20 days before
  const late = r.items.find((i) => i.date === "2026-11-02")!; // 3 days before
  assert.equal(early.priority, "MEDIUM");
  assert.equal(late.priority, "HIGH");
});

test("the pacing is by the days left: with the exam far away the tasks are spread thinly, not all at once", () => {
  const near = buildStudyPlan(input({ exams: [exam("Quiz Begins", "2026-10-22")] }));
  const far = buildStudyPlan(input({ exams: [exam("Quiz Begins", "2026-12-12")] }));
  const perDay = (r: ReturnType<typeof buildStudyPlan>) => Math.max(...[...byDate(r.items.filter((i) => i.kind === "TOPIC")).values()].map((l) => l.length));
  assert.equal(perDay(far), 1);
  assert.equal(perDay(near), 2);
});

test("an exam further away than the horizon: only the first days are written, but the pacing still covers all of them", () => {
  const r = buildStudyPlan(input({ exams: [exam("Pre-Final Examination Begins", "2026-12-12")] }));
  const last = r.items[r.items.length - 1].date;
  assert.ok(last <= addDays(TODAY, EXAM_HORIZON_DAYS - 1));
  assert.equal(r.items[0].date, TODAY);
  // 9 chapters over 54 study days is at most one a day, so the first 28 days hold 9 study tasks, none of them dropped
  assert.equal(r.items.filter((i) => i.kind === "TOPIC").length, UNITS);
  assert.equal(r.unscheduled, 0);
});

// ---- several exams -----------------------------------------------------------------------------------------------------------------------------

test("multiple upcoming exams: each gets its own stretch, the second one starts after the first is over", () => {
  const a = exam("Unit Test Begins", "2026-10-22");
  const b = exam("Half-Yearly Examination Begins", "2026-10-30", { endDate: "2026-11-01" });
  const c = exam("Pre-Final Examination Begins", "2026-11-10");
  const r = buildStudyPlan(input({ exams: [c, a, b] })); // given out of order
  assert.deepEqual(r.exams.map((x) => x.label), ["Unit Test", "Half-Yearly Examination", "Pre-Final Examination"]);
  const forA = r.items.filter((i) => i.title.endsWith("for Unit Test"));
  const forB = r.items.filter((i) => i.title.endsWith("for Half-Yearly Examination"));
  const forC = r.items.filter((i) => i.title.endsWith("for Pre-Final Examination"));
  assert.ok(forA.length > 0 && forB.length > 0 && forC.length > 0);
  assert.ok(forA.every((i) => i.date < "2026-10-22"));
  assert.ok(forB.every((i) => i.date > "2026-10-22" && i.date < "2026-10-30"), "B's stretch starts the day after A");
  assert.ok(forC.every((i) => i.date > "2026-11-01" && i.date < "2026-11-10"), "C's stretch starts after B's LAST day");
  assert.ok(r.items.every((i) => i.date !== "2026-10-22" && i.date !== "2026-10-30" && i.date < "2026-11-10"), "nothing on an exam day or after the last exam");
});

test("two exams on back-to-back days: the second has no days of its own and says so", () => {
  const r = buildStudyPlan(input({ exams: [exam("Maths Test Begins", "2026-10-26"), exam("Science Test Begins", "2026-10-27")] }));
  assert.ok(r.notes.some((x) => /no days left to prepare for Science Test/.test(x)));
  assert.ok(r.items.every((i) => i.title.endsWith("for Maths Test")));
});

// ---- no exams ---------------------------------------------------------------------------------------------------------------------------------

test("no upcoming exams: a general plan from the real chapters, and it says it is general", () => {
  const r = buildStudyPlan(input());
  assert.equal(r.mode, "general");
  assert.ok(r.notes.some((x) => /general plan/.test(x)));
  assert.ok(r.items.length > 0 && r.items.every((i) => i.date >= TODAY && i.date < addDays(TODAY, 14)));
  const real = new Set(SUBJECTS.flatMap((s) => s.chapters.map((c) => `Study: ${c.name}`)));
  for (const i of r.items.filter((x) => x.kind === "TOPIC")) assert.ok(real.has(i.title), `${i.title} is a real chapter`);
  assert.ok(!r.items.some((i) => /continue current chapter/.test(i.title)), "no placeholder when real chapters exist");
  assert.ok(!r.items.some((i) => / for /.test(i.title)), "no exam is mentioned");
  assert.equal(r.items.find((i) => i.date === addDays(TODAY, 3))?.kind, "REVISION", "every fourth day is revision, as before");
});

test("exams that have already started or are over are not planned for (today's exam has no days to prepare)", () => {
  const r = buildStudyPlan(input({ exams: [exam("Today Test Begins", TODAY), exam("Old Test Begins", "2026-09-01")] }));
  assert.equal(r.mode, "general");
});

test("a class with no chapters at all still gets honest subject-level tasks instead of invented chapters", () => {
  const subjects: PlanSubject[] = [{ id: "h", name: "Hindi", chapters: [] }];
  const exam1 = buildStudyPlan(input({ subjects, exams: [exam("Quiz Begins", "2026-10-26")] }));
  assert.ok(exam1.items.some((i) => i.title === "Study: Hindi textbook · for Quiz"));
  const general = buildStudyPlan(input({ subjects }));
  assert.ok(general.items.some((i) => i.title === "Hindi: continue current chapter"));
});

test("no subjects at all: nothing is invented", () => {
  const r = buildStudyPlan(input({ subjects: [], exams: [exam("Quiz Begins", "2026-10-26")] }));
  assert.deepEqual(r.items, []);
  assert.ok(r.notes.some((x) => /No subjects are set up/.test(x)));
});

// ---- scope: subjects and chapters --------------------------------------------------------------------------------------------------------

test("an exam that names no subject or chapters covers all subjects in textbook order, and tells the student to check with the teacher", () => {
  const r = buildStudyPlan(input({ exams: [exam("Half-Yearly Examination Begins", "2026-10-30")] }));
  assert.ok(r.notes.some((x) => /does not say which subjects or chapters/.test(x) && /Check with your teacher/.test(x)));
  const subjects = new Set(r.items.map((i) => i.subject));
  assert.deepEqual(subjects, new Set(["Mathematics", "Physical Science", "English"]));
  const maths = r.items.filter((i) => i.subject === "Mathematics" && i.kind === "TOPIC").map((i) => i.title);
  assert.deepEqual(maths, ["Real Numbers", "Polynomials", "Pair of Linear Equations", "Quadratic Equations"].map((c) => `Study: ${c} · for Half-Yearly Examination`), "textbook order");
});

test("a subject named in the exam title narrows the plan to that subject", () => {
  const r = buildStudyPlan(input({ exams: [exam("Mathematics Unit Test Begins", "2026-10-30")] }));
  assert.ok(r.items.every((i) => i.subject === "Mathematics"));
  assert.ok(!r.notes.some((x) => /does not say which subjects/.test(x)));
});

test("an exam schedule names its subject and chapters: only those chapters are planned (a chapter range, or chapter names)", () => {
  const byRange = buildStudyPlan(input({ exams: [exam("Maths Test", "2026-10-30", { source: "schedule", papers: [{ subjectName: "Mathematics", chapterScope: "Chapters 1-2" }] })] }));
  assert.deepEqual(byRange.items.filter((i) => i.kind === "TOPIC").map((i) => i.title), ["Study: Real Numbers · for Maths Test", "Study: Polynomials · for Maths Test"]);
  const byName = buildStudyPlan(input({ exams: [exam("Maths Test", "2026-10-30", { source: "schedule", papers: [{ subjectName: "Mathematics", chapterScope: "Quadratic Equations and polynomials" }] })] }));
  assert.deepEqual(byName.items.filter((i) => i.kind === "TOPIC").map((i) => i.title).sort(), ["Study: Polynomials · for Maths Test", "Study: Quadratic Equations · for Maths Test"]);
});

test("a chapter list that cannot be matched falls back to every chapter of the subject and says so", () => {
  const r = buildStudyPlan(input({ exams: [exam("Maths Test", "2026-10-30", { source: "schedule", papers: [{ subjectName: "Mathematics", chapterScope: "the first half" }] })] }));
  assert.equal(r.items.filter((i) => i.kind === "TOPIC").length, 4);
  assert.ok(r.notes.some((x) => /could not be matched/.test(x)));
});

test("a subject the class does not teach is scheduled by its own name only, with no chapters made up", () => {
  const r = buildStudyPlan(input({ exams: [exam("Drawing Test", "2026-10-30", { source: "schedule", papers: [{ subjectName: "Drawing", chapterScope: null }] })] }));
  assert.ok(r.items.every((i) => i.subject === "Drawing"));
  assert.ok(r.items.some((i) => i.title === "Study: Drawing textbook · for Drawing Test"));
});

// ---- weak areas and the fallback --------------------------------------------------------------------------------------------------------

test("weak topics come first, weakest first, marked HIGH, and their chapters are HIGH too", () => {
  const weak: PlanWeak[] = [
    { subjectId: "s", subjectName: "Physical Science", chapterName: "Acids, Bases and Salts", topicName: "pH scale", mastery: 35 },
    { subjectId: "m", subjectName: "Mathematics", chapterName: "Polynomials", topicName: "Zeroes", mastery: 20 },
  ];
  const r = buildStudyPlan(input({ exams: [exam("Quiz Begins", "2026-11-10")], weak }));
  const study = r.items.filter((i) => i.kind === "TOPIC");
  assert.equal(study[0].title, "Review weak topic: Zeroes (Polynomials) · for Quiz", "the weakest topic is scheduled first");
  assert.equal(study[1].title, "Review weak topic: pH scale (Acids, Bases and Salts) · for Quiz");
  assert.equal(study[0].priority, "HIGH");
  assert.equal(study.find((i) => i.title === "Study: Polynomials · for Quiz")?.priority, "HIGH");
  assert.equal(study.find((i) => i.title === "Study: Real Numbers · for Quiz")?.priority, "MEDIUM");
});

test("weak topics from a subject the exam does not cover are not scheduled for it", () => {
  const weak: PlanWeak[] = [{ subjectId: "s", subjectName: "Physical Science", chapterName: "Chemical Reactions", topicName: "Balancing", mastery: 25 }];
  const r = buildStudyPlan(input({ exams: [exam("Mathematics Test Begins", "2026-11-10")], weak }));
  assert.ok(!r.items.some((i) => /Balancing/.test(i.title)));
});

test("with no mastery data nothing is called weak: no 'weak topic' tasks and no weak-based HIGH priority far from the exam", () => {
  const r = buildStudyPlan(input({ exams: [exam("Quiz Begins", "2026-12-01")] }));
  assert.ok(!r.items.some((i) => /weak/i.test(i.title)));
  assert.ok(r.items.filter((i) => i.date <= "2026-11-10").every((i) => i.priority === "MEDIUM"));
  const general = buildStudyPlan(input());
  assert.ok(!general.items.some((i) => /^Review:/.test(i.title)));
});

test("in the general plan weak topics still come first, in the existing 'Review: <topic>' wording", () => {
  const weak: PlanWeak[] = [{ subjectId: "m", subjectName: "Mathematics", chapterName: "Polynomials", topicName: "Zeroes", mastery: 20 }];
  const r = buildStudyPlan(input({ weak }));
  assert.equal(r.items.find((i) => i.kind === "TOPIC")?.title, "Review: Zeroes");
});

// ---- not enough time ------------------------------------------------------------------------------------------------------------------------

test("the exam is tomorrow: only today is left, and it is revision only", () => {
  const r = buildStudyPlan(input({ exams: [exam("Quiz Begins", "2026-10-17")] }));
  assert.ok(r.items.length > 0 && r.items.every((i) => i.kind === "REVISION" && i.date === TODAY));
  assert.ok(r.notes.some((x) => /revision only/.test(x)));
});

test("not enough days for every chapter: the LAST chapters are left out, the day limit is kept, and the notes say how many", () => {
  const r = buildStudyPlan(input({ exams: [exam("Quiz Begins", "2026-10-20")] })); // 4 days: 3 study days = 6 slots for 9 chapters
  const study = r.items.filter((i) => i.kind === "TOPIC");
  assert.equal(study.length, 6);
  assert.equal(r.unscheduled, 3);
  assert.ok(r.notes.some((x) => /Only 6 of 9 study tasks fit before Quiz; 3 chapters had to be left out/.test(x)));
  for (const [, list] of byDate(r.items)) assert.ok(list.length <= (list.every((i) => i.kind === "REVISION") ? MAX_REVISION_TASKS_PER_DAY : MAX_TASKS_PER_DAY));
  // textbook order is kept: what is dropped is the end of the interleaved list (each subject's later chapters)
  assert.ok(study.some((i) => i.title.startsWith("Study: Real Numbers")));
  assert.ok(!study.some((i) => i.title.startsWith("Study: Quadratic Equations")));
});

test("with the usual 3 subjects every subject is revised; with many subjects the notes say how many fit", () => {
  const many: PlanSubject[] = Array.from({ length: 12 }, (_, i) => ({ id: `s${i}`, name: `Subject ${i + 1}`, chapters: [{ id: `c${i}`, name: `Chapter ${i + 1}` }] }));
  const r = buildStudyPlan(input({ subjects: many, exams: [exam("Quiz Begins", "2026-11-05")] }));
  assert.equal(r.items.filter((i) => i.kind === "REVISION").length, 9, "3 revision days x 3 short tasks");
  assert.ok(r.notes.some((x) => /only time to revise 9 of your 12 subjects/.test(x)));
});

test("an exam whose preparation stretch starts after the days being written says nothing yet (it is planned when the plan is regenerated)", () => {
  const r = buildStudyPlan(input({ exams: [exam("Unit Test Begins", "2026-12-12"), exam("Annual Examination Begins", "2027-03-12")] }));
  assert.ok(r.items.length > 0 && r.items.every((i) => i.title.endsWith("for Unit Test")));
  assert.ok(!r.notes.some((x) => /Annual/.test(x)));
});

test("revision days rule", () => {
  assert.deepEqual([0, 1, 2, 3, 5, 6, 8, 9, 20].map(revisionDaysFor), [0, 1, 1, 1, 1, 2, 2, 3, 3]);
});

// ---- already-done work and duplicates ---------------------------------------------------------------------------------------------------------

test("a chapter already completed for this exam is not scheduled again", () => {
  const done = new Set(["Study: Real Numbers · for Quiz"]);
  const r = buildStudyPlan(input({ exams: [exam("Quiz Begins", "2026-10-30")], completedTitles: done }));
  assert.ok(!r.items.some((i) => i.title === "Study: Real Numbers · for Quiz"));
  assert.equal(r.items.filter((i) => i.kind === "TOPIC").length, UNITS - 1);
});

test("items already kept use up their day's allowance, and an identical (date, title) is never added twice", () => {
  const e = exam("Quiz Begins", "2026-10-30");
  const first = buildStudyPlan(input({ exams: [e] }));
  const some = first.items[0];
  const again = buildStudyPlan(input({ exams: [e], existingKeys: new Set([`${some.date}|${some.title}`]) }));
  assert.ok(!again.items.some((i) => i.date === some.date && i.title === some.title));
  const full = buildStudyPlan(input({ exams: [e], takenByDate: { [TODAY]: MAX_TASKS_PER_DAY } }));
  assert.ok(!full.items.some((i) => i.date === TODAY), "a full day gets nothing more");
});

test("the same inputs always give the same plan", () => {
  const e = exam("Half-Yearly Examination Begins", "2026-11-05");
  assert.deepEqual(buildStudyPlan(input({ exams: [e] })), buildStudyPlan(input({ exams: [e] })));
  assert.equal(daysBetween(TODAY, "2026-11-05"), 20);
});

// ---- exams in progress ----------------------------------------------------------------------------------------------------------------------------

test("REGRESSION: an exam running 15-20 Oct with today the 17th - no preparation on the 17th-20th, it resumes on the 21st for the next exam", () => {
  const running = exam("Unit Test Begins", "2026-10-15", { label: "Unit Test", endDate: "2026-10-20" });
  const next = exam("Final Begins", "2026-11-02");
  const r = buildStudyPlan(input({ today: "2026-10-17", exams: [running, next] }));
  assert.equal(r.mode, "exam-aware");
  assert.deepEqual(r.exams.map((e) => e.label), ["Final"], "the running exam is not something to prepare for");
  assert.ok(r.items.length > 0);
  assert.ok(r.items.every((i) => i.date >= "2026-10-21" && i.date < "2026-11-02"), "everything is after the running exam and before the next one");
  assert.equal(r.items[0].date, "2026-10-21");
  assert.ok(r.items.every((i) => i.title.endsWith("for Final")));
});

test("an exam on today's date (a single day) blocks today: nothing is scheduled today", () => {
  const r = buildStudyPlan(input({ exams: [exam("Quiz Begins", TODAY), exam("Final Begins", "2026-11-02")] }));
  assert.ok(r.items.every((i) => i.date > TODAY));
});

test("with no further exam, a running exam still blocks its days in the general plan", () => {
  const r = buildStudyPlan(input({ today: "2026-10-17", exams: [exam("Unit Test Begins", "2026-10-15", { label: "Unit Test", endDate: "2026-10-20" })] }));
  assert.equal(r.mode, "general");
  assert.ok(r.items.length > 0 && r.items.every((i) => i.date > "2026-10-20"));
});

test("the next exam falling inside the running exam's days has no days of its own and says so", () => {
  const r = buildStudyPlan(input({ today: "2026-10-17", exams: [exam("Unit Test Begins", "2026-10-15", { label: "Unit Test", endDate: "2026-10-20" }), exam("Quiz Begins", "2026-10-19")] }));
  assert.deepEqual(r.items, []);
  assert.ok(r.notes.some((n) => /no days left to prepare for Quiz/.test(n)));
});

test("a finished exam does not block anything", () => {
  const r = buildStudyPlan(input({ exams: [exam("Old Begins", "2026-10-10", { label: "Old", endDate: "2026-10-12" }), exam("Final Begins", "2026-11-02")] }));
  assert.equal(r.items[0].date, TODAY);
});

// ---- papers: subjects and chapters from the exam schedules ---------------------------------------------------------------------------------------

test("an exam with several papers plans exactly those subjects, each with its own chapters", () => {
  const e = exam("Half-Yearly Examination Begins", "2026-10-30", {
    label: "Half-Yearly Examination",
    papers: [
      { subjectName: "Mathematics", chapterScope: "Chapters 1-2" },
      { subjectName: "English", chapterScope: null },
    ],
  });
  const r = buildStudyPlan(input({ exams: [e] }));
  const study = r.items.filter((i) => i.kind === "TOPIC");
  assert.deepEqual(new Set(study.map((i) => i.subject)), new Set(["Mathematics", "English"]), "no Physical Science");
  assert.equal(study.filter((i) => i.subject === "Mathematics").length, 2, "only chapters 1-2 of Mathematics");
  assert.equal(study.filter((i) => i.subject === "English").length, 2, "all of English");
  assert.ok(!r.notes.some((n) => /does not say which subjects/.test(n)), "the exam's subjects are known");
});

// ---- the partial-papers note -------------------------------------------------------------------------------------------------------------------

const papersExam = (papers: { subjectName: string; chapterScope: string | null }[], title = "Half-Yearly Examination Begins") =>
  exam(title, "2026-10-30", { label: title.replace(/ Begins$/, ""), papers });

test("NOTE 1: only a Mathematics paper while the class has other subjects - the student is told the plan rests on Mathematics and to ask the teacher", () => {
  const r = buildStudyPlan(input({ exams: [papersExam([{ subjectName: "Mathematics", chapterScope: null }])] }));
  const expected = "Your plan for Half-Yearly Examination is based on the published papers for Mathematics. Check with your teacher whether other subjects are included.";
  assert.deepEqual(r.coverageNotes, [expected]);
  assert.ok(r.notes.includes(expected), "also among the general notes");
  assert.deepEqual(new Set(r.items.map((i) => i.subject)), new Set(["Mathematics"]), "and the plan really is Mathematics only - nothing is assumed about the others");
});

test("NOTE 2: papers for every known subject - no note, because nothing is missing", () => {
  const r = buildStudyPlan(input({ exams: [papersExam(SUBJECTS.map((s) => ({ subjectName: s.name, chapterScope: null })))] }));
  assert.deepEqual(r.coverageNotes, []);
  assert.ok(!r.notes.some((n) => /Check with your teacher/.test(n)));
});

test("NOTE 2b: a paper for a subject the class does not teach does not hide the fact that all known subjects are covered (no note), and is not counted as one of them", () => {
  const all = [...SUBJECTS.map((s) => ({ subjectName: s.name, chapterScope: null })), { subjectName: "Drawing", chapterScope: null }];
  assert.deepEqual(buildStudyPlan(input({ exams: [papersExam(all)] })).coverageNotes, []);
  const some = buildStudyPlan(input({ exams: [papersExam([{ subjectName: "Mathematics", chapterScope: null }, { subjectName: "Drawing", chapterScope: null }])] }));
  assert.equal(some.coverageNotes.length, 1);
  assert.match(some.coverageNotes[0], /published papers for Mathematics and Drawing\./);
});

test("NOTE 2c: two of three subjects - both are named, and the note still appears", () => {
  const r = buildStudyPlan(input({ exams: [papersExam([{ subjectName: "Mathematics", chapterScope: null }, { subjectName: "English", chapterScope: null }])] }));
  assert.match(r.coverageNotes[0], /published papers for Mathematics and English\. Check with your teacher/);
});

test("NOTE 2d: the subject names come from the data, so a long list is shortened with a count, never invented", () => {
  const many: PlanSubject[] = ["A", "B", "C", "D", "E", "F"].map((n) => ({ id: n, name: `Subject ${n}`, chapters: [{ id: `${n}1`, name: `Chapter ${n}` }] }));
  const r = buildStudyPlan(input({ subjects: many, exams: [papersExam(["A", "B", "C", "D", "E"].map((n) => ({ subjectName: `Subject ${n}`, chapterScope: null })))] }));
  assert.match(r.coverageNotes[0], /papers for Subject A, Subject B, Subject C and 2 more\./);
});

test("NOTE 3a: no subject scope at all - the plan says so and asks the student to check which portion it covers (the existing note, now also a coverage note)", () => {
  const r = buildStudyPlan(input({ exams: [exam("Half-Yearly Examination Begins", "2026-10-30", { label: "Half-Yearly Examination" })] }));
  assert.equal(r.coverageNotes.length, 1);
  assert.match(r.coverageNotes[0], /does not say which subjects or chapters it covers/);
  assert.match(r.coverageNotes[0], /Check with your teacher/);
  assert.ok(!r.coverageNotes.some((n) => /based on the published papers/.test(n)), "no false claim of a partial paper list");
});

test("NOTE 3b: a subject named only in the exam's title is a partial, unconfirmed scope - the note says so; naming every subject needs none", () => {
  const partial = buildStudyPlan(input({ exams: [exam("Mathematics Unit Test Begins", "2026-10-30", { label: "Mathematics Unit Test" })] }));
  assert.equal(partial.coverageNotes.length, 1);
  assert.match(partial.coverageNotes[0], /Your plan for Mathematics Unit Test covers Mathematics, named in the exam's title\. Check with your teacher whether other subjects are included\./);
  const allNamed = buildStudyPlan(input({ exams: [exam("Mathematics Physical Science and English Test Begins", "2026-10-30", { label: "Mathematics Physical Science and English Test" })] }));
  assert.deepEqual(allNamed.coverageNotes, []);
});

test("NOTE 3c: a paper whose subject cannot be matched to a known subject (for example plain 'Science' when the class has Physical Science) is reported as unconfirmed, not assumed", () => {
  const r = buildStudyPlan(input({ exams: [papersExam([{ subjectName: "Science", chapterScope: null }])] }));
  assert.equal(r.coverageNotes.length, 1);
  assert.match(r.coverageNotes[0], /published papers for Science\. Check with your teacher whether other subjects are included\./);
  assert.ok(r.items.every((i) => i.subject === "Science"), "no chapters of another subject are borrowed for it");
});

test("NOTE 3d: an unreadable chapter list is also a coverage note", () => {
  const r = buildStudyPlan(input({ exams: [papersExam(SUBJECTS.map((s) => ({ subjectName: s.name, chapterScope: s.name === "Mathematics" ? "the first half" : null })))] }));
  assert.equal(r.coverageNotes.length, 1);
  assert.match(r.coverageNotes[0], /chapter list "the first half" could not be matched/);
});

test("NOTE 4: other notes (not enough days, chapters left out) are NOT coverage notes - they stay out of the page callout", () => {
  const r = buildStudyPlan(input({ exams: [papersExam(SUBJECTS.map((s) => ({ subjectName: s.name, chapterScope: null })), "Quiz Begins")].map((e) => ({ ...e, startDate: "2026-10-20" })) }));
  assert.ok(r.notes.some((n) => /had to be left out/.test(n)));
  assert.deepEqual(r.coverageNotes, []);
});

test("NOTE 5: the same note for the same exam is not repeated, and each exam gets its own", () => {
  const a = papersExam([{ subjectName: "Mathematics", chapterScope: null }], "Unit Test Begins");
  const b = { ...papersExam([{ subjectName: "English", chapterScope: null }], "Quiz Begins"), startDate: "2026-11-06" };
  const r = buildStudyPlan(input({ exams: [a, b] }));
  assert.equal(r.coverageNotes.length, 2);
  assert.ok(r.coverageNotes[0].includes("Unit Test") && r.coverageNotes[1].includes("Quiz"));
});
