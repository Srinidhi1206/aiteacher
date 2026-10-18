// Offline tests for "the papers of one test are prepared for together" (groupSubjectPapers in lib/analytics/exam-plan.ts).
// A date sheet is published as one row per subject ("Unit Test 2 - Mathematics" on 26 Oct, "Unit Test 2 - Physical Science" on 27 Oct, ...). Planned one by one, every paper but the first used to
// find "no days left"; now they are planned as one exam made of those papers. The planner is pure; saving and regenerating run against an IN-MEMORY fake database. No database, network, AI or clock.
import { test } from "node:test";
import assert from "node:assert/strict";

import { buildStudyPlan, groupSubjectPapers, planStaleReason, studyTitle, reviseChapterTitle, MAX_SERIES_GAP_DAYS, MAX_TASKS_PER_DAY, MAX_REVISION_TASKS_PER_DAY, type PlanInput, type PlanSubject, type PlannedItem } from "@/lib/analytics/exam-plan";
import { generateLearningPathCore, type PathDb } from "@/lib/analytics/learning-path-core";
import { buildExamItems, pickNextExam, type ExamItem, type RawScheduleExam } from "@/lib/calendar/next-exam";
import { localDateString } from "@/lib/calendar/day";
import { matches } from "./fake-where";

const TODAY = "2026-10-18";
const chapters = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => ({ id: `${prefix}${i}`, name: `${prefix} chapter ${i + 1}` }));
// A Class 10 shaped class: five subjects with papers, two (Telugu, Hindi) without. Chapter counts are the real ones' order of size.
const SUBJECTS: PlanSubject[] = [
  { id: "m", name: "Mathematics", chapters: chapters("Maths", 14) },
  { id: "s", name: "Physical Science", chapters: chapters("Physics", 12) },
  { id: "b", name: "Biological Science", chapters: chapters("Biology", 10) },
  { id: "e", name: "English", chapters: chapters("English", 9) },
  { id: "z", name: "Social Studies", chapters: chapters("Social", 22) },
  { id: "t", name: "Telugu", chapters: chapters("Telugu", 8) },
  { id: "h", name: "Hindi", chapters: chapters("Hindi", 8) },
];
const PAPERS: [string, string][] = [["Mathematics", "2026-10-26"], ["Physical Science", "2026-10-27"], ["Biological Science", "2026-10-28"], ["English", "2026-10-29"], ["Social Studies", "2026-10-30"]];
const paperRows = (test: string, papers = PAPERS, idPrefix = "c") => papers.map(([s, d], i) => ({ id: `${idPrefix}-${test}-${i}`, title: `${test} - ${s}`, startDate: d, endDate: null as string | null }));
const input = (exams: ExamItem[], over: Partial<PlanInput> = {}): PlanInput => ({ today: TODAY, exams, subjects: SUBJECTS, weak: [], completedTitles: new Set(), existingKeys: new Set(), takenByDate: {}, ...over });
const ut2 = () => buildExamItems(paperRows("Unit Test 2"));
const bySubject = (items: PlannedItem[]) => {
  const m = new Map<string, { study: number; revision: number }>();
  for (const i of items) {
    const row = m.get(i.subject) ?? { study: 0, revision: 0 };
    if (i.kind === "REVISION") row.revision++;
    else row.study++;
    m.set(i.subject, row);
  }
  return m;
};
const perDay = (items: { date: string; kind: string }[]) => {
  const m = new Map<string, { date: string; kind: string }[]>();
  for (const i of items) m.set(i.date, [...(m.get(i.date) ?? []), i]);
  return m;
};
const withinLimits = (items: { date: string; kind: string }[], taken: Record<string, number> = {}) => {
  for (const [d, l] of perDay(items)) assert.ok(l.length + (taken[d] ?? 0) <= (l.every((i) => i.kind === "REVISION") ? MAX_REVISION_TASKS_PER_DAY : MAX_TASKS_PER_DAY), `${d}: ${l.length} tasks (+${taken[d] ?? 0} already there) is over the daily limit`);
};

// ---- the defect, and the fix ---------------------------------------------------------------------------------------------------------------------------------

test("the calendar keeps five separate exam rows (this is what Next Exam shows); only the PLAN joins them", () => {
  const items = ut2();
  assert.equal(items.length, 5);
  assert.deepEqual(items.map((e) => e.label), PAPERS.map(([s]) => `Unit Test 2 - ${s}`));
  const next = pickNextExam(items, TODAY)!;
  assert.equal(next.label, "Unit Test 2 - Mathematics");
  assert.equal(next.startDate, "2026-10-26");
  assert.equal(next.daysUntil, 8);
});

test("five consecutive subject papers are planned as ONE exam: every paper's subject gets study AND revision tasks; subjects without a paper get none", () => {
  const r = buildStudyPlan(input(ut2()));
  assert.equal(r.mode, "exam-aware");
  assert.deepEqual(r.exams, [{ label: "Unit Test 2", startDate: "2026-10-26", daysLeft: 8 }]);
  const dist = bySubject(r.items);
  assert.deepEqual([...dist.keys()].sort(), PAPERS.map(([s]) => s).sort());
  for (const [s] of PAPERS) {
    assert.ok(dist.get(s)!.study >= 2, `${s} has study tasks (got ${dist.get(s)!.study})`);
    assert.equal(dist.get(s)!.revision, 1, `${s} has its revision task`);
  }
  assert.ok(!dist.has("Telugu") && !dist.has("Hindi"));
  assert.ok(r.items.every((i) => i.title.endsWith(" · for Unit Test 2")));
  assert.ok(!r.notes.some((n) => /no days left/i.test(n)), JSON.stringify(r.notes));
});

test("dates: every task is from today to the day BEFORE the first paper, revision comes after study, and the daily limits hold", () => {
  const r = buildStudyPlan(input(ut2()));
  assert.ok(r.items.every((i) => i.date >= TODAY && i.date < "2026-10-26"), "nothing on or after the first paper's day");
  withinLimits(r.items);
  const lastStudy = r.items.filter((i) => i.kind === "TOPIC").map((i) => i.date).sort().pop()!;
  const firstRevision = r.items.filter((i) => i.kind === "REVISION").map((i) => i.date).sort()[0];
  assert.ok(firstRevision > lastStudy, "the revision days are the last days");
});

test("what is already on a day (kept or done tasks) uses up that day's allowance", () => {
  const taken: Record<string, number> = { "2026-10-19": 2, "2026-10-20": 2, "2026-10-24": 3 };
  const r = buildStudyPlan(input(ut2(), { takenByDate: taken }));
  withinLimits(r.items, taken);
  assert.equal(r.items.filter((i) => i.date === "2026-10-19" || i.date === "2026-10-20" || i.date === "2026-10-24").length, 0);
});

test("the plan does not depend on the order the exams arrive in, and is the same every time", () => {
  const forward = buildStudyPlan(input(ut2()));
  const reversed = buildStudyPlan(input([...ut2()].reverse()));
  assert.deepEqual(reversed.items, forward.items);
  assert.deepEqual(buildStudyPlan(input(ut2())).items, forward.items);
});

test("the exam after the series is prepared from the day after the LAST paper, never before", () => {
  const exams = buildExamItems([...paperRows("Unit Test 2"), { id: "hy", title: "Half-Yearly Examination", startDate: "2026-12-14", endDate: "2026-12-23" }]);
  const r = buildStudyPlan(input(exams));
  const hy = r.items.filter((i) => i.title.endsWith("for Half-Yearly Examination"));
  assert.ok(hy.length > 0 && hy.every((i) => i.date >= "2026-10-31"), "Half-Yearly preparation starts after 30 Oct");
  assert.ok(r.items.filter((i) => i.title.endsWith("for Unit Test 2")).every((i) => i.date < "2026-10-26"));
  withinLimits(r.items);
});

// ---- chapter scope, completed work ---------------------------------------------------------------------------------------------------------------------------

test("exams of the older exam schedules (one row per subject, same name) are joined too, and each paper keeps its own chapter scope", () => {
  const rows: RawScheduleExam[] = PAPERS.map(([s, d], i) => ({ id: `s${i}`, name: "Unit Test 2", examDate: d, subjectName: s, chapterScope: s === "Mathematics" ? "Chapters 3-4" : "" }));
  const r = buildStudyPlan(input(buildExamItems([], rows)));
  assert.deepEqual([...bySubject(r.items).keys()].sort(), PAPERS.map(([s]) => s).sort());
  const maths = r.items.filter((i) => i.subject === "Mathematics" && i.kind === "TOPIC").map((i) => i.title).sort();
  assert.deepEqual(maths, ["Study: Maths chapter 3 · for Unit Test 2", "Study: Maths chapter 4 · for Unit Test 2"], "only the chapters the paper names");
  assert.ok(r.items.filter((i) => i.subject === "English" && i.kind === "TOPIC").length > 2, "a paper with no chapter scope covers its subject");
});

test("a chapter already done is not planned again and gets its revision; done under the paper's OWN earlier label counts too, but only for that subject", () => {
  const first = buildStudyPlan(input(ut2()));
  const done = first.items.find((i) => i.kind === "TOPIC")!;
  const again = buildStudyPlan(input(ut2(), { completedTitles: new Set([done.title]) }));
  assert.ok(!again.items.some((i) => i.title === done.title), "not studied a second time");
  // ticked while the papers were still planned one by one: "Study: Maths chapter 1 · for Unit Test 2 - Mathematics"
  const old = new Set([studyTitle("Maths chapter 1", "Unit Test 2 - Mathematics"), studyTitle("Physics chapter 1", "Unit Test 2 - Mathematics")]);
  const r = buildStudyPlan(input(ut2(), { completedTitles: old }));
  assert.ok(!r.items.some((i) => i.title === studyTitle("Maths chapter 1", "Unit Test 2")), "the old tick is respected");
  assert.ok(r.items.some((i) => i.title === reviseChapterTitle("Maths chapter 1", "Unit Test 2")), "and the chapter gets its revision");
  assert.ok(r.items.some((i) => i.title === studyTitle("Physics chapter 1", "Unit Test 2")), "another subject's chapter is not covered by Mathematics' label");
  withinLimits(r.items);
});

// ---- what is NOT joined --------------------------------------------------------------------------------------------------------------------------------------

test("a single paper is not grouped: it keeps its own title and plan", () => {
  const solo = buildExamItems(paperRows("Unit Test 2", [["Mathematics", "2026-10-26"]]));
  assert.deepEqual(groupSubjectPapers(solo, SUBJECTS), solo, "returned as it was");
  const r = buildStudyPlan(input(solo));
  assert.deepEqual(r.exams.map((e) => e.label), ["Unit Test 2 - Mathematics"]);
  assert.deepEqual([...bySubject(r.items).keys()], ["Mathematics"]);
});

test("different tests, a repeated subject, a subject the class does not teach, and papers more than a week apart are never joined", () => {
  const different = buildExamItems([...paperRows("Unit Test 2", [["Mathematics", "2026-10-26"]]), ...paperRows("Unit Test 3", [["Physical Science", "2026-10-27"]], "d")]);
  assert.equal(groupSubjectPapers(different, SUBJECTS).length, 2);
  const twice = buildExamItems([...paperRows("Unit Test 2", [["Mathematics", "2026-10-26"]]), { id: "x", title: "Unit Test 2 - Mathematics Paper II", startDate: "2026-10-27", endDate: null }]);
  assert.equal(groupSubjectPapers(twice, SUBJECTS).length, 2, "the same subject twice is two exams");
  const retake = buildExamItems([...paperRows("Unit Test 2", [["Mathematics", "2026-10-26"]]), ...paperRows("Unit Test 2", [["Mathematics", "2026-10-27"]], "r")]);
  assert.equal(groupSubjectPapers(retake, SUBJECTS).length, 2, "the same subject on two days is not one sitting of five subjects");
  const foreign = buildExamItems([...paperRows("Unit Test 2", [["Mathematics", "2026-10-26"]]), ...paperRows("Unit Test 2", [["Sanskrit", "2026-10-27"]], "f")]);
  assert.equal(groupSubjectPapers(foreign, SUBJECTS).length, 2, "Sanskrit is not a subject of the class");
  const apart = buildExamItems([...paperRows("Unit Test 2", [["Mathematics", "2026-10-26"]]), ...paperRows("Unit Test 2", [["English", `2026-11-${String(2 + MAX_SERIES_GAP_DAYS).padStart(2, "0")}`]], "a")]);
  assert.equal(groupSubjectPapers(apart, SUBJECTS).length, 2, "more than a week after the previous paper");
  const withinGap = buildExamItems([...paperRows("Unit Test 2", [["Mathematics", "2026-10-26"]]), ...paperRows("Unit Test 2", [["English", "2026-11-02"]], "a")]);
  assert.equal(groupSubjectPapers(withinGap, SUBJECTS).length, 1, "a week later (a break in the date sheet) is still one sitting");
});

test("papers that follow each other within a week but run longer than one exam span are cut at the span", () => {
  const six = [["Mathematics", "2026-10-26"], ["Physical Science", "2026-11-01"], ["Biological Science", "2026-11-07"], ["English", "2026-11-13"], ["Social Studies", "2026-11-19"], ["Telugu", "2026-11-25"], ["Hindi", "2026-12-01"]] as [string, string][];
  const grouped = groupSubjectPapers(buildExamItems(paperRows("Unit Test 2", six)), SUBJECTS);
  assert.equal(grouped.length, 2);
  assert.equal(grouped[0].papers.length, 6, "the first six papers (30 days) are one sitting");
  assert.equal(grouped[0].endDate, "2026-11-25");
  assert.equal(grouped[1].label, "Unit Test 2 - Hindi", "the seventh would take it past a month: it stays on its own");
});

test("exams that name no subject, or several, or already have papers on a calendar exam, are left exactly as they were", () => {
  const exams = buildExamItems([
    { id: "h", title: "Half-Yearly Examination", startDate: "2026-12-14", endDate: "2026-12-23" },
    { id: "both", title: "Mathematics and English Quiz", startDate: "2026-11-02", endDate: null },
    { id: "q", title: "Quiz - Mathematics", startDate: "2026-11-03", endDate: null },
  ]);
  assert.deepEqual(groupSubjectPapers(exams, SUBJECTS), exams);
  const host: ExamItem[] = [{ id: "u", title: "Unit Test 2", label: "Unit Test 2", startDate: "2026-10-26", endDate: "2026-10-30", source: "calendar", papers: [{ subjectName: "Mathematics", chapterScope: null }, { subjectName: "English", chapterScope: null }] }];
  assert.deepEqual(groupSubjectPapers(host, SUBJECTS), host, "an exam that already lists its papers is not touched");
});

// ---- the stretch while a series is being written, and old plans -----------------------------------------------------------------------------------------------

test("while the series is being written, nothing is planned on a day a paper is being written, and nothing breaks", () => {
  const r = buildStudyPlan(input(ut2(), { today: "2026-10-27" }));
  // Physical Science is being written today, so today is blocked, and the next paper is tomorrow: there is no stretch left for the rest (as before - papers written on consecutive days leave none).
  assert.equal(r.items.length, 0);
  assert.ok(r.notes.some((n) => /no days left to prepare for Unit Test 2/i.test(n)), JSON.stringify(r.notes));
});

test("a plan made when the papers were planned one by one is reported as out of date, with the reason, and a plan made now is not", () => {
  const r = buildStudyPlan(input(ut2()));
  const reason = planStaleReason(["Study: Maths chapter 1 · for Unit Test 2 - Mathematics"], true, r);
  assert.equal(reason, "it plans the papers of Unit Test 2 one at a time; they are now planned together as one exam.");
  assert.equal(planStaleReason(r.items.map((i) => i.title), true, r), null);
  // an unrelated mismatch keeps its own wording
  assert.match(planStaleReason(["Study: A · for Other Test"], true, r) ?? "", /does not include Unit Test 2 yet/);
});

// ---- saving and regenerating: five published calendar events ---------------------------------------------------------------------------------------------

const NOW = new Date("2026-10-18T05:00:00Z"); // 10:30 IST on 18 Oct 2026, whatever zone the machine is in
const utc = (d: string) => new Date(`${d}T00:00:00.000Z`);
type Item = { id: string; studyPlanId: string; day: number; date: Date; kind: string; subject: string; title: string; durationMinutes: number; priority: string; completed: boolean };

function world() {
  const plans: { id: string; studentId: string; createdAt: Date; items: Item[] }[] = [];
  let seq = 0;
  const events = PAPERS.map(([s, d], i) => ({ id: `ev${i}`, title: `Unit Test 2 - ${s}`, type: "EXAM", startDate: utc(d), endDate: null, isPublished: true, schoolId: "demo", boardId: "bse", schoolClassId: "c10" }));
  const db = {
    student: { findUnique: async () => ({ id: "stu", schoolId: "demo", boardId: "bse", schoolClassId: "c10" }) },
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
  return { db, items: () => plans[0]?.items ?? [] };
}
const gen = (w: ReturnType<typeof world>) => generateLearningPathCore(w.db, "stu", NOW);
const keyOf = (i: Item) => `${localDateString(i.date)}|${i.title}`;

test("generating from five published calendar rows: all five subjects are prepared, before the first paper, within the daily limits; generating again changes nothing", async () => {
  const w = world();
  const summary = await gen(w);
  assert.equal(summary?.mode, "exam-aware");
  assert.deepEqual(summary?.exams.map((e) => e.label), ["Unit Test 2"]);
  const dist = bySubject(w.items().map((i) => ({ ...i, date: localDateString(i.date) })) as never);
  assert.deepEqual([...dist.keys()].sort(), PAPERS.map(([s]) => s).sort());
  for (const [s] of PAPERS) assert.ok(dist.get(s)!.study >= 2 && dist.get(s)!.revision === 1, s);
  const dated = w.items().map((i) => ({ date: localDateString(i.date), kind: i.kind }));
  assert.ok(dated.every((d) => d.date >= TODAY && d.date < "2026-10-26"));
  withinLimits(dated);
  const first = w.items().map(keyOf).sort();
  await gen(w);
  await gen(w);
  const again = w.items().map(keyOf).sort();
  assert.deepEqual(again, first);
  assert.equal(new Set(again).size, again.length, "no duplicates");
});

test("regenerating keeps a ticked chapter exactly as it was (same row), and it then gets one revision task, not a second study task", async () => {
  const w = world();
  await gen(w);
  const study = w.items().find((i) => i.kind === "TOPIC" && i.subject === "English")!;
  study.completed = true;
  await gen(w);
  assert.equal(w.items().filter((i) => i.title === study.title).length, 1);
  assert.equal(w.items().find((i) => i.title === study.title)!.id, study.id);
  const chapter = study.title.replace(/^Study: /, "").replace(/ · for Unit Test 2$/, "");
  assert.equal(w.items().filter((i) => i.title === reviseChapterTitle(chapter, "Unit Test 2")).length, 1);
  withinLimits(w.items().map((i) => ({ date: localDateString(i.date), kind: i.kind })));
});
