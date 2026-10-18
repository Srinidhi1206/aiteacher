// Offline tests for WHEN A STUDENT'S EXISTING PLAN BECOMES OUT OF DATE and that it is only ever refreshed by the student's own action: an exam is published, cancelled
// (unpublished), moved earlier or later, its subjects change, and the plan's completed work is never touched by being checked. The REAL plan generator, advice and calendar publish
// logic run against one in-memory database; nothing is written to a real database and no AI is involved.
import { test } from "node:test";
import assert from "node:assert/strict";

import { generateLearningPathCore, previewPlanAdviceCore, type PathDb } from "@/lib/analytics/learning-path-core";
import { examsWithLateTasks } from "@/lib/analytics/exam-plan";
import { setAcademicEventPublishedCore, type CalendarActor, type CalendarDb } from "@/lib/calendar/core";
import { makeWorld, type EventRow } from "./fake-world";

const NOW = new Date("2026-10-20T05:00:00Z");
const ADMIN: CalendarActor = { userId: "admin", isSuperAdmin: false, schoolId: "demo" };

function setup() {
  const w = makeWorld({ clock: NOW });
  w.students.s = { id: "s", schoolId: "demo", boardId: "bse", schoolClassId: "c10" };
  w.classSubjects.c10 = [
    { id: "m", name: "Mathematics", chapters: [{ id: "m1", name: "Real Numbers" }, { id: "m2", name: "Polynomials" }, { id: "m3", name: "Sets" }] },
    { id: "e", name: "English", chapters: [{ id: "e1", name: "Unit 1" }, { id: "e2", name: "Unit 2" }] },
  ];
  const event = (id: string, title: string, start: string, over: Partial<EventRow> = {}) =>
    w.events.push({ id, title, type: "EXAM", startDate: new Date(`${start}T00:00:00Z`), endDate: null, description: null, academicYear: "2026-27", isPublished: true, schoolId: "demo", boardId: "bse", schoolClassId: "c10", createdByUserId: "x", ...over });
  return { w, event, db: w.db as PathDb };
}
const advice = async (w: ReturnType<typeof setup>["w"]) => previewPlanAdviceCore(w.db as PathDb, "s", NOW);
const staleNote = (a: { notes: string[] }) => a.notes.find((n) => /out of date/.test(n)) ?? null;

test("a plan made before any exam was published is reported out of date when one is - and generating it again makes it current", async () => {
  const { w, event, db } = setup();
  await generateLearningPathCore(db, "s", NOW);
  assert.equal((await advice(w)).stale, false, "a general plan with no exams is current");
  event("a", "Unit Test 1 Begins", "2026-11-05");
  const after = await advice(w);
  assert.equal(after.stale, true);
  assert.match(staleNote(after) ?? "", /it does not include Unit Test 1 yet/);
  await generateLearningPathCore(db, "s", NOW);
  assert.equal((await advice(w)).stale, false);
});

test("an exam that is cancelled (unpublished) leaves the plan reported out of date, naming the exam; regenerating removes its unfinished tasks", async () => {
  const { w, event, db } = setup();
  event("a", "Unit Test 1 Begins", "2026-11-05");
  await generateLearningPathCore(db, "s", NOW);
  const forExam = () => w.planOf("s")!.items.filter((i) => i.title.endsWith("· for Unit Test 1"));
  assert.ok(forExam().length > 0);
  assert.equal((await setAcademicEventPublishedCore(w.db as unknown as CalendarDb, ADMIN, "a", false)).ok, true);
  const note = staleNote(await advice(w)) ?? "";
  assert.match(note, /it still plans for Unit Test 1, which is no longer an upcoming published exam/);
  await generateLearningPathCore(db, "s", NOW);
  assert.equal(forExam().filter((i) => !i.completed).length, 0, "no unfinished task is left for the cancelled exam");
  assert.equal((await advice(w)).stale, false);
});

test("an exam moved EARLIER than some of its tasks is reported out of date (the tasks would fall on or after the exam)", async () => {
  const { w, event, db } = setup();
  event("a", "Unit Test 1 Begins", "2026-11-20");
  await generateLearningPathCore(db, "s", NOW);
  assert.equal((await advice(w)).stale, false);
  const tasks = w.planOf("s")!.items.filter((i) => i.title.endsWith("· for Unit Test 1"));
  assert.ok(tasks.length >= 3, "the plan has several tasks for it, in the days right after today");
  // brought forward so that it begins on the day of the plan's LAST task for it
  const lastTask = new Date(Math.max(...tasks.map((i) => i.date.getTime())));
  const newStart = `${lastTask.getFullYear()}-${String(lastTask.getMonth() + 1).padStart(2, "0")}-${String(lastTask.getDate()).padStart(2, "0")}`;
  w.events.find((e) => e.id === "a")!.startDate = new Date(`${newStart}T00:00:00Z`);
  const note = staleNote(await advice(w)) ?? "";
  assert.match(note, /the date of Unit Test 1 has changed, and some of its tasks are now planned on or after it/);
  await generateLearningPathCore(db, "s", NOW);
  const remaining = w.planOf("s")!.items.filter((i) => i.title.endsWith("· for Unit Test 1") && !i.completed);
  assert.ok(remaining.every((i) => i.date.getTime() < new Date(`${newStart}T00:00:00`).getTime()), "after regenerating every unfinished task is before the new date");
  assert.equal((await advice(w)).stale, false);
});

test("an exam moved LATER is not called out of date (the plan still prepares for it, just earlier than needed)", async () => {
  const { w, event, db } = setup();
  event("a", "Unit Test 1 Begins", "2026-11-05");
  await generateLearningPathCore(db, "s", NOW);
  w.events.find((e) => e.id === "a")!.startDate = new Date("2026-11-12T00:00:00Z");
  assert.equal((await advice(w)).stale, false);
});

test("checking never changes the plan: no task is added, removed or completed by looking", async () => {
  const { w, event, db } = setup();
  event("a", "Unit Test 1 Begins", "2026-11-05");
  await generateLearningPathCore(db, "s", NOW);
  const before = JSON.stringify(w.planOf("s"));
  const writes = { ...w.calls };
  w.events.find((e) => e.id === "a")!.startDate = new Date("2026-10-28T00:00:00Z");
  await advice(w);
  assert.equal(JSON.stringify(w.planOf("s")), before);
  assert.deepEqual(w.calls, writes);
});

test("completed work survives every refresh: ticking a task, then an exam change, then regenerating keeps the ticked task", async () => {
  const { w, event, db } = setup();
  event("a", "Unit Test 1 Begins", "2026-11-20");
  await generateLearningPathCore(db, "s", NOW);
  const first = w.planOf("s")!.items.filter((i) => i.title.endsWith("· for Unit Test 1")).sort((a, b) => a.date.getTime() - b.date.getTime())[0];
  first.completed = true;
  w.events.find((e) => e.id === "a")!.startDate = new Date("2026-11-03T00:00:00Z");
  await generateLearningPathCore(db, "s", NOW);
  assert.ok(w.planOf("s")!.items.some((i) => i.id === first.id && i.completed), "the ticked task is still there, still ticked");
});

test("the late-task check on its own: only unfinished tasks FOR that exam, on or after its first day", () => {
  const exams = [{ label: "Unit Test 1", startDate: "2026-11-03" }, { label: "Half-Yearly", startDate: "2026-12-01" }];
  assert.deepEqual(examsWithLateTasks([{ title: "Study: A · for Unit Test 1", date: "2026-11-02" }, { title: "Study: B · for Half-Yearly", date: "2026-11-30" }], exams), []);
  assert.deepEqual(examsWithLateTasks([{ title: "Study: A · for Unit Test 1", date: "2026-11-03" }], exams), ["Unit Test 1"], "on the exam's first day counts");
  assert.deepEqual(examsWithLateTasks([{ title: "Revision - recap this week's topics", date: "2026-12-30" }, { title: "Study: A", date: "2026-12-30" }], exams), [], "tasks that are not for an exam are never reported");
});
