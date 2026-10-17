// Offline tests for what the Study Plan page tells the student beyond the tasks: why their school's exam dates may not reach them, whether their existing plan is out of date
// (and why), and the "no graded results yet" note. Pure functions plus the read-only advice over an in-memory database; nothing is written and nothing is sent anywhere.
import { test } from "node:test";
import assert from "node:assert/strict";

import { placementNotes, planStaleReason, staleMessage, type PlanResult } from "@/lib/analytics/exam-plan";
import { previewPlanAdviceCore, type PathDb } from "@/lib/analytics/learning-path-core";
import { buildPlanPageNotes, subjectLinkMap, NO_RESULTS_NOTE } from "@/lib/study-plan/page-notes";
import { makeWorld } from "./fake-world";

const result = (titles: string[], mode: PlanResult["mode"] = "exam-aware"): PlanResult => ({
  mode,
  items: titles.map((title) => ({ date: "2026-10-21", kind: "TOPIC" as const, subject: "X", title, durationMinutes: 40, priority: "MEDIUM" as const })),
  notes: [],
  exams: [],
  unscheduled: 0,
  coverageNotes: [],
});

// ---- placement -----------------------------------------------------------------------------------------------------------------------------------------------

test("placement notes say exactly what is missing - and nothing for a complete record", () => {
  assert.deepEqual(placementNotes({ schoolId: "s", boardId: "b", schoolClassId: "c" }), []);
  assert.match(placementNotes({ schoolId: "s", boardId: "b", schoolClassId: null })[0], /class has not been set up yet/);
  assert.match(placementNotes({ schoolId: null, boardId: "b", schoolClassId: "c" })[0], /haven't been placed in a school yet/);
  assert.match(placementNotes({ schoolId: "s", boardId: null, schoolClassId: "c" })[0], /no board set/);
});

test("a missing class is reported alone: the other gaps are moot without a class", () => {
  assert.equal(placementNotes({ schoolId: null, boardId: null, schoolClassId: null }).length, 1);
});

// ---- is the plan out of date? --------------------------------------------------------------------------------------------------------------------------------

test("a student with no plan yet is not told it is out of date (the page already offers to create one)", () => {
  assert.equal(planStaleReason([], false, result(["Study: A · for Unit Test 1"])), null);
});

test("a plan built before an exam existed is out of date, and says which exam is missing", () => {
  const reason = planStaleReason(["Study: A", "Revision - recap this week's topics"], true, result(["Study: A · for Unit Test 1", "Revise: Maths · for Unit Test 1"]));
  assert.match(reason ?? "", /does not include Unit Test 1/);
  assert.match(staleMessage(reason!), /^Your study plan is out of date: it does not include Unit Test 1 yet\. Press "Generate my learning path" to update it - completed and past tasks are kept\.$/);
});

test("several exams are named together", () => {
  assert.match(planStaleReason([], true, result(["Study: A · for Unit Test 1", "Study: B · for Half-Yearly Examination"])) ?? "", /Unit Test 1 and Half-Yearly Examination/);
});

test("a plan for an exam that is no longer published is out of date", () => {
  const reason = planStaleReason(["Study: A · for Old Test"], true, result(["Study: A"], "general"));
  assert.match(reason ?? "", /still plans for Old Test, which is no longer an upcoming published exam/);
});

test("an up-to-date plan is not flagged - and neither is a plan simply because days have passed", () => {
  assert.equal(planStaleReason(["Study: A · for Unit Test 1"], true, result(["Study: A · for Unit Test 1", "Study: B · for Unit Test 1"])), null);
  assert.equal(planStaleReason(["Study: Old chapter", "Review: X"], true, result(["Study: New chapter", "Review: Y"], "general")), null, "a general plan is never 'stale' just because its tasks moved");
});

test("a plan with the old generic placeholders is flagged once real chapters are available", () => {
  assert.match(planStaleReason(["Mathematics: continue current chapter"], true, result(["Study: Real Numbers"], "general")) ?? "", /before chapter-level planning/);
  assert.equal(planStaleReason(["Mathematics: continue current chapter"], true, result([], "general")), null, "but not when there is nothing better to offer");
});

test("a plan with no tasks left is flagged when a fresh one would have tasks", () => {
  assert.match(planStaleReason([], true, result(["Study: A"], "general")) ?? "", /no tasks left/);
  assert.equal(planStaleReason([], true, result([], "general")), null);
});

// ---- the read-only advice over a database --------------------------------------------------------------------------------------------------------------------------

const NOW = new Date("2026-10-20T05:00:00Z");
function world() {
  const w = makeWorld({ clock: NOW });
  w.students.s = { id: "s", schoolId: "demo", boardId: "bse", schoolClassId: "c10" };
  w.classSubjects.c10 = [{ id: "m", name: "Mathematics", chapters: [{ id: "m1", name: "Real Numbers" }, { id: "m2", name: "Polynomials" }] }];
  return w;
}

test("the advice is read-only: reading it writes no plan, no task and no event", async () => {
  const w = world();
  w.events.push({ id: "e", title: "Unit Test 1 Begins", type: "EXAM", startDate: new Date("2026-11-01T00:00:00Z"), endDate: null, description: null, academicYear: null, isPublished: true, schoolId: "demo", boardId: "bse", schoolClassId: "c10", createdByUserId: null });
  await previewPlanAdviceCore(w.db as PathDb, "s", NOW);
  assert.deepEqual([w.calls.planCreates, w.calls.planItemCreates, w.calls.planItemDeletes, w.calls.eventUpdates], [0, 0, 0, 0]);
  assert.equal(w.plans.length, 0);
});

test("an unplaced student sees why; a complete one does not", async () => {
  const w = world();
  w.students.u = { id: "u", schoolId: null, boardId: "bse", schoolClassId: "c10" };
  assert.match((await previewPlanAdviceCore(w.db as PathDb, "u", NOW)).notes.join(" "), /haven't been placed in a school/);
  assert.equal((await previewPlanAdviceCore(w.db as PathDb, "s", NOW)).notes.filter((n) => /placed|board/.test(n)).length, 0);
});

test("a failed read is an error, not an empty advice", async () => {
  const w = world();
  w.failAcademicReads = true;
  await assert.rejects(() => previewPlanAdviceCore(w.db as PathDb, "s", NOW), /simulated database failure/);
});

// ---- the page notes ---------------------------------------------------------------------------------------------------------------------------------------------

test("until the student has graded results the page says the plan follows textbook order; with results it does not", () => {
  assert.deepEqual(buildPlanPageNotes({ advice: [], hasPlanItems: true, hasWeakAreas: false }), [NO_RESULTS_NOTE]);
  assert.deepEqual(buildPlanPageNotes({ advice: [], hasPlanItems: true, hasWeakAreas: true }), []);
  assert.deepEqual(buildPlanPageNotes({ advice: [], hasPlanItems: false, hasWeakAreas: false }), [], "no plan, nothing to qualify");
});

test("engine advice comes first and is never duplicated", () => {
  const notes = buildPlanPageNotes({ advice: ["A", "A", "B"], hasPlanItems: true, hasWeakAreas: false });
  assert.deepEqual(notes, ["A", "B", NO_RESULTS_NOTE]);
});

test("subject links: a name that two subjects share is left out rather than guessed", () => {
  assert.deepEqual(subjectLinkMap([{ id: "1", name: "Maths" }, { id: "2", name: "Science" }, { id: "3", name: "Maths" }]), { Science: "2" });
});
