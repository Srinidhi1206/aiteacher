// Offline tests for the rule that keeps a book-holding placeholder chapter out of the study plan (lib/analytics/plan-chapters.ts + loadPlanInputs): the real English
// case ("SCERT Textbook (test)" next to eight genuine units) and the cases the rule must NOT touch. In-memory database; no network; nothing is written to a real database.
import { test } from "node:test";
import assert from "node:assert/strict";

import { isBookHolderChapter, planChapters, type ChapterFacts } from "@/lib/analytics/plan-chapters";
import { generateLearningPathCore, previewPlanAdviceCore, type PathDb } from "@/lib/analytics/learning-path-core";
import { makeWorld, type SubjectRow } from "./fake-world";

const NOW = new Date("2026-10-20T05:00:00Z");
const UNITS = ["Unit 1: Personality Development", "Unit 2: Wit and Humour", "Unit 3: Human Relations", "Unit 4: Films and Theatre", "Unit 5: Social Issues", "Unit 6: Bio-Diversity", "Unit 7: Nation and Diversity", "Unit 8: Human Rights"];
const PLACEHOLDER = "SCERT Textbook (test)";

/** English exactly as in production: the placeholder first (no lessons, the textbook filed under it), then eight units with three lessons each. */
const english = (over: { placeholderHoldsBook?: boolean; placeholderTopics?: number } = {}): SubjectRow => ({
  id: "eng",
  name: "English",
  chapters: [
    { id: "ch-test", name: PLACEHOLDER, _count: { topics: over.placeholderTopics ?? 0 }, studyMaterials: over.placeholderHoldsBook === false ? [] : [{ id: "textbook" }] },
    ...UNITS.map((name, i) => ({ id: `u${i + 1}`, name, _count: { topics: 3 }, studyMaterials: [] })),
  ],
});

const facts = (id: string, name: string, topicCount?: number, hasTextbookMaterial?: boolean): ChapterFacts => ({ id, name, topicCount, hasTextbookMaterial });

// ---- the rule on its own ---------------------------------------------------------------------------------------------------------------------------------------------

test("a chapter with no lessons that holds a textbook, in a subject whose other chapters have lessons, is not a lesson", () => {
  const list = [facts("a", PLACEHOLDER, 0, true), facts("b", "Unit 1", 3, false), facts("c", "Unit 2", 2, false)];
  assert.equal(isBookHolderChapter(list[0], list), true);
  assert.deepEqual(planChapters(list).map((c) => c.name), ["Unit 1", "Unit 2"], "the rest keep their order");
});

test("a chapter with no lessons and NO textbook is kept (an appendix, or a chapter whose lessons are not entered yet)", () => {
  const list = [facts("a", "Appendix", 0, false), facts("b", "Unit 1", 3, false)];
  assert.deepEqual(planChapters(list).map((c) => c.name), ["Appendix", "Unit 1"]);
});

test("a chapter that has lessons is kept even if a textbook is filed under it", () => {
  const list = [facts("a", "Unit 1", 3, true), facts("b", "Unit 2", 3, false)];
  assert.equal(planChapters(list).length, 2);
});

test("in a subject where NO chapter has lessons (Mathematics, Hindi, ...) every chapter is kept, even one that holds a textbook", () => {
  const list = [facts("a", "Real Numbers", 0, true), facts("b", "Sets", 0, false), facts("c", "Polynomials", 0, false)];
  assert.deepEqual(planChapters(list).map((c) => c.name), ["Real Numbers", "Sets", "Polynomials"]);
});

test("when nothing is known (older callers, a failed lookup) nothing is skipped", () => {
  const list = [facts("a", "X"), facts("b", "Y")];
  assert.deepEqual(planChapters(list), list);
  assert.equal(planChapters([facts("a", "Only chapter", 0, true)]).length, 1, "a subject with a single chapter is never emptied");
});

test("two book-holding placeholders are both skipped, and the genuine units remain", () => {
  const list = [facts("a", "Book A", 0, true), facts("b", "Book B", 0, true), facts("c", "Unit 1", 4, false)];
  assert.deepEqual(planChapters(list).map((c) => c.name), ["Unit 1"]);
});

// ---- through the real plan generator ---------------------------------------------------------------------------------------------------------------------------------

function worldWith(subjects: SubjectRow[]) {
  const w = makeWorld({ clock: NOW });
  w.students.s = { id: "s", schoolId: "demo", boardId: "bse", schoolClassId: "c10" };
  w.classSubjects.c10 = subjects;
  return w;
}
const titles = (w: ReturnType<typeof worldWith>) => (w.planOf("s")?.items ?? []).map((i) => i.title);

test("the generated English plan has no 'SCERT Textbook (test)' task, and the eight genuine units appear in their intended order", async () => {
  const w = worldWith([english()]);
  await generateLearningPathCore(w.db as PathDb, "s", NOW);
  const all = titles(w);
  assert.ok(!all.some((t) => t.includes(PLACEHOLDER)), all.join(" | "));
  const study = (w.planOf("s")?.items ?? []).filter((i) => i.title.startsWith("Study: ")).sort((a, b) => a.date.getTime() - b.date.getTime() || a.day - b.day).map((i) => i.title);
  // A general plan with one subject cycles through the chapters again once it has used them all, so the first eight tasks are the units in order.
  assert.deepEqual(study.slice(0, 8), UNITS.map((u) => `Study: ${u}`));
  assert.ok(study.every((t) => UNITS.some((u) => t === `Study: ${u}`)), "and every study task is one of the eight units");
});

test("the same holds in an exam-aware plan", async () => {
  const w = worldWith([english()]);
  w.events.push({ id: "e", title: "Unit Test 1 Begins", type: "EXAM", startDate: new Date("2026-11-05T00:00:00Z"), endDate: null, description: null, academicYear: null, isPublished: true, schoolId: "demo", boardId: "bse", schoolClassId: "c10", createdByUserId: null });
  const res = await generateLearningPathCore(w.db as PathDb, "s", NOW);
  assert.equal(res?.mode, "exam-aware");
  assert.ok(!titles(w).some((t) => t.includes(PLACEHOLDER)));
  assert.ok(titles(w).some((t) => t.startsWith("Study: Unit 1: Personality Development")));
});

test("the placeholder IS still planned when it is not clearly a book holder: no textbook filed under it, or it has lessons of its own", async () => {
  for (const over of [{ placeholderHoldsBook: false }, { placeholderTopics: 2 }]) {
    const w = worldWith([english(over)]);
    await generateLearningPathCore(w.db as PathDb, "s", NOW);
    assert.ok(titles(w).some((t) => t.includes(PLACEHOLDER)), JSON.stringify(over));
  }
});

test("other subjects are untouched: Mathematics keeps every chapter, including a lesson-less 'Appendix' and a chapter that holds a book", async () => {
  const maths: SubjectRow = {
    id: "mth",
    name: "Mathematics",
    chapters: [
      { id: "m1", name: "Real Numbers", _count: { topics: 0 }, studyMaterials: [{ id: "book" }] },
      { id: "m2", name: "Sets", _count: { topics: 0 }, studyMaterials: [] },
      { id: "m3", name: "Appendix: Mathematical Modelling", _count: { topics: 0 }, studyMaterials: [] },
    ],
  };
  const w = worldWith([english(), maths]);
  await generateLearningPathCore(w.db as PathDb, "s", NOW);
  const t = titles(w);
  for (const c of ["Real Numbers", "Sets", "Appendix: Mathematical Modelling"]) assert.ok(t.includes(`Study: ${c}`), c);
  assert.ok(!t.some((x) => x.includes(PLACEHOLDER)));
});

test("generating changes nothing about the curriculum: the subject's chapters are exactly as they were", async () => {
  const subject = english();
  const before = JSON.stringify(subject);
  const w = worldWith([subject]);
  await generateLearningPathCore(w.db as PathDb, "s", NOW);
  await previewPlanAdviceCore(w.db as PathDb, "s", NOW);
  assert.equal(JSON.stringify(subject), before);
  assert.equal(subject.chapters.length, 9);
});

test("the read-only preview and the generator agree on the chapters (no 'out of date' report caused by the placeholder)", async () => {
  const w = worldWith([english()]);
  await generateLearningPathCore(w.db as PathDb, "s", NOW);
  const advice = await previewPlanAdviceCore(w.db as PathDb, "s", NOW);
  assert.equal(advice.stale, false);
});

// ---- a plan made before the placeholder was filtered (or before a chapter was deleted or renamed) is reported out of date -------------------------------------------------
import { planStaleReason, removedChapterNames, staleMessage, type PlanResult } from "@/lib/analytics/exam-plan";

const emptyResult = (titles: string[]): PlanResult => ({ mode: "general", items: titles.map((title) => ({ date: "2026-10-21", kind: "TOPIC" as const, subject: "X", title, durationMinutes: 40, priority: "MEDIUM" as const })), notes: [], exams: [], unscheduled: 0, coverageNotes: [] });

test("tasks for chapters the class no longer has are found by name - and nothing else is reported", () => {
  const titles = [
    "Study: Real Numbers",
    "Study: Real Numbers · for Unit Test 1",
    "Study: SCERT Textbook (test)",
    "Study: SCERT Textbook (test) · for Unit Test 1",
    "Study: Mathematics textbook · for Unit Test 1", // a subject-level task, for a subject that exists
    "Revise: Mathematics · for Unit Test 1",
    "Review weak topic: Sets (Real Numbers) · for Unit Test 1",
    "Revision - recap this week's topics",
    "Mock test - mixed topics",
  ];
  assert.deepEqual(removedChapterNames(titles, { chapters: ["Real Numbers"], subjects: ["Mathematics"] }), ["SCERT Textbook (test)"]);
  assert.deepEqual(removedChapterNames(titles, { chapters: ["Real Numbers", "SCERT Textbook (test)"], subjects: ["Mathematics"] }), [], "nothing to report while the chapter still exists");
  assert.deepEqual(removedChapterNames(["Study: Hindi textbook · for X"], { chapters: [], subjects: ["Mathematics"] }), ["Hindi textbook"], "a subject-level task for a subject the class no longer has");
});

test("names are compared the way chapters are everywhere else: case and punctuation do not matter", () => {
  assert.deepEqual(removedChapterNames(["Study: real  numbers!"], { chapters: ["Real Numbers"], subjects: [] }), []);
});

test("the stale message names the removed chapters, says whether it is one or several, and an exam change still comes first", () => {
  const known = { chapters: ["Real Numbers"], subjects: ["Mathematics"] };
  const one = planStaleReason(["Study: SCERT Textbook (test)"], true, emptyResult(["Study: Real Numbers"]), known);
  assert.equal(one, "it still has tasks for SCERT Textbook (test), which is no longer in your syllabus.");
  assert.match(staleMessage(one!), /^Your study plan is out of date: it still has tasks for SCERT Textbook \(test\), which is no longer in your syllabus\. Press "Generate my learning path"/);
  assert.match(planStaleReason(["Study: Old A", "Study: Old B"], true, emptyResult(["Study: Real Numbers"]), known) ?? "", /Old A and Old B, which are no longer in your syllabus/);
  assert.match(planStaleReason(["Study: SCERT Textbook (test)"], true, emptyResult(["Study: Real Numbers · for Unit Test 1"]), known) ?? "", /does not include Unit Test 1/, "a missing exam is reported first");
  assert.equal(planStaleReason(["Study: Real Numbers"], true, emptyResult(["Study: Real Numbers"]), known), null, "an up-to-date plan is not flagged");
  assert.equal(planStaleReason(["Study: SCERT Textbook (test)"], false, emptyResult([]), known), null, "no plan yet: nothing to flag");
  assert.ok(!/no longer in your syllabus/.test(planStaleReason(["Study: SCERT Textbook (test)"], true, emptyResult(["Study: Real Numbers"])) ?? ""), "without the curriculum the check is simply not made");
});

test("the real case end to end: a student's existing plan has a future 'SCERT Textbook (test)' task; the page says the plan is out of date, regenerating removes it and keeps completed work, and then it is up to date", async () => {
  const w = worldWith([english()]);
  const day = (d: string) => new Date(`${d}T00:00:00`);
  const item = (id: string, date: string, title: string, completed = false) => ({ id, studyPlanId: "p1", day: 1, date: day(date), kind: "TOPIC", subject: "English", title, durationMinutes: 40, priority: "MEDIUM", completed });
  w.plans.push({
    id: "p1",
    studentId: "s",
    createdAt: new Date("2026-10-10T03:30:00Z"),
    items: [item("done", "2026-10-12", "Study: SCERT Textbook (test)", true), item("future", "2026-10-21", "Study: SCERT Textbook (test)"), item("good", "2026-10-22", "Study: Unit 1: Personality Development")],
  });
  const before = await previewPlanAdviceCore(w.db as PathDb, "s", NOW);
  assert.equal(before.stale, true);
  assert.ok(before.notes.some((n) => /still has tasks for SCERT Textbook \(test\), which is no longer in your syllabus/.test(n)), before.notes.join(" | "));
  assert.equal(w.planOf("s")!.items.length, 3, "checking changes nothing");

  await generateLearningPathCore(w.db as PathDb, "s", NOW);
  const titlesAfter = w.planOf("s")!.items.filter((i) => !i.completed && i.date >= day("2026-10-20")).map((i) => i.title);
  assert.ok(!titlesAfter.some((t) => t.includes(PLACEHOLDER)), titlesAfter.join(" | "));
  assert.ok(w.planOf("s")!.items.some((i) => i.id === "done"), "the completed task (a past record) is kept");
  assert.equal((await previewPlanAdviceCore(w.db as PathDb, "s", NOW)).stale, false, "up to date once regenerated");
});
