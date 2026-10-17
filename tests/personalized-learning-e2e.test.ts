// End-to-end (offline) test of the personalised-learning workflow, stage by stage, against ONE in-memory database:
//   academic calendar document -> extraction + validation -> admin review -> saved as DRAFTS -> hidden from students -> bulk publish -> only the intended audience
//   sees it -> next exam / countdown -> exam-aware, subject- and chapter-level plans that DIFFER between students -> weak topics and progress -> safe regeneration -> failures.
// The stages are connected on purpose: what the importer saves is exactly what the student lookup and the plan generator later read. Mocked: the PDF text layer and the
// AI reader. Nothing here touches a real database, the network, OCR, or any AI service.
import { test } from "node:test";
import assert from "node:assert/strict";

import { extractCalendarPreview } from "@/lib/calendar-import/extract";
import { confirmCalendarImportCore } from "@/lib/calendar-import/core";
import { publishManyAcademicEventsCore, calendarPublishDigests, type CalendarActor, type CalendarDb } from "@/lib/calendar/core";
import { dayStart, todayInIndia } from "@/lib/calendar/day";
import { findNextExamAt, listUpcomingExams, type ExamDb } from "@/lib/calendar/next-exam";
import { generateLearningPathCore, previewPlanAdviceCore, type PathDb } from "@/lib/analytics/learning-path-core";
import type { PreviewEvent } from "@/lib/calendar-import/types";
import { makeWorld } from "./fake-world";

const NOW = new Date("2026-10-20T05:00:00Z"); // 10:30 IST on 20 October 2026
const TODAY = todayInIndia(NOW);
const TODAY_START = dayStart(TODAY);

const SUPER: CalendarActor = { userId: "super", isSuperAdmin: true, schoolId: null };
const DEMO_ADMIN: CalendarActor = { userId: "demo-admin", isSuperAdmin: false, schoolId: "demo" };
const OTHER_ADMIN: CalendarActor = { userId: "other-admin", isSuperAdmin: false, schoolId: "other" };
const SCOPE = { schoolId: "demo", boardId: "bse", schoolClassId: "c10" };

const w = makeWorld({ clock: NOW });
const db = w.db as CalendarDb & ExamDb & PathDb;

// A known syllabus. Class 10 and Class 9 are different classes with different subjects and chapters; Hindi has NO chapter list yet.
const ch = (id: string, ...names: string[]) => names.map((name, i) => ({ id: `${id}${i + 1}`, name }));
w.classSubjects.c10 = [
  { id: "m10", name: "Mathematics", chapters: ch("m10-", "Real Numbers", "Polynomials", "Quadratic Equations") },
  { id: "s10", name: "Physical Science", chapters: ch("s10-", "Chemical Reactions", "Acids, Bases and Salts", "Light") },
  { id: "e10", name: "English", chapters: ch("e10-", "The Dear Departed", "Journey to the End of the Earth") },
  { id: "h10", name: "Hindi", chapters: [] },
];
w.classSubjects.c9 = [
  { id: "m9", name: "Mathematics", chapters: ch("m9-", "Number Systems", "Coordinate Geometry") },
  { id: "so9", name: "Social Studies", chapters: ch("so9-", "The French Revolution", "Rivers of India") },
];
// Students: two with different academic contexts, one at another school, and three with incomplete records.
w.students.s1 = { id: "s1", schoolId: "demo", boardId: "bse", schoolClassId: "c10" };
w.students.s2 = { id: "s2", schoolId: "demo", boardId: "bse", schoolClassId: "c9" };
w.students.s3 = { id: "s3", schoolId: "other", boardId: "bse", schoolClassId: "c10" };
w.students.s4 = { id: "s4", schoolId: null, boardId: "bse", schoolClassId: "c10" }; // not placed in a school
w.students.s5 = { id: "s5", schoolId: "demo", boardId: null, schoolClassId: "c10" }; // no board
w.students.s6 = { id: "s6", schoolId: "demo", boardId: "bse", schoolClassId: null }; // no class
const weakMaths = { mastery: 30, topic: { name: "Discriminant", chapter: { name: "Quadratic Equations", subject: { id: "m10", name: "Mathematics" } } } };
const weakLight = { mastery: 20, topic: { name: "Refraction", chapter: { name: "Light", subject: { id: "s10", name: "Physical Science" } } } };
const weakRivers = { mastery: 40, topic: { name: "Himalayan rivers", chapter: { name: "Rivers of India", subject: { id: "so9", name: "Social Studies" } } } };
w.weak.s1 = [weakMaths];
w.weak.s2 = [weakRivers];

// The document: a PDF text layer with multiple exams, a holiday, an exact duplicate, a probable duplicate and exams with no end row.
const CALENDAR_TEXT = [
  "TEACHAI DEMO SCHOOL - Class 10 (BSE Telangana) - ACADEMIC CALENDAR 2026-27",
  "1 Nov 2026 - Unit Test 1 Begins",
  "6 Nov 2026 - Unit Test 1 Ends",
  "12 Nov 2026 - Diwali Holiday",
  "20 Nov 2026 - Half-Yearly Examination Begins",
  "20 Nov 2026 - Half-Yearly Examination Begins",
  "25 Nov 2026 - Results Declaration (Half-Yearly)",
  "25 Nov 2026 - Half-Yearly Results",
  "5 Dec 2026 - Pre-Final Examination Begins",
].join("\n");
const bytes = new TextEncoder().encode("%PDF-1.4 mock");

let preview: Extract<Awaited<ReturnType<typeof extractCalendarPreview>>, { ok: true }>;
let draftIds: string[] = [];

const toImport = (rows: PreviewEvent[]) => rows.map((r) => ({ title: r.title, type: r.type, startDate: r.startDate, endDate: r.endDate, description: r.description, academicYear: r.academicYear, schoolClassId: "" }));
const titlesOf = (studentId: string) => w.futureItems(studentId, TODAY_START).map((i) => i.title);
const generate = (id: string) => generateLearningPathCore(db, id, NOW);

// ---- Stage 1: extraction and validation ------------------------------------------------------------------------------------------------------------------

test("STAGE 1 extraction: dates and types are read from the document, an exact duplicate is collapsed, and nothing is invented", async () => {
  const out = await extractCalendarPreview(bytes, "application/pdf", { pdfText: async () => CALENDAR_TEXT, reader: null }, { defaultYear: 2026 });
  assert.equal(out.ok, true);
  if (!out.ok) return;
  preview = out;
  assert.equal(out.method, "text-layer");
  assert.equal(out.academicYear, "2026-27");
  const byTitle = (t: string) => out.events.find((e) => e.title === t)!;
  assert.equal(out.events.length, 7, "8 lines, one exact duplicate collapsed");
  assert.deepEqual([byTitle("Unit Test 1 Begins").startDate, byTitle("Unit Test 1 Begins").type], ["2026-11-01", "EXAM"]);
  assert.deepEqual([byTitle("Unit Test 1 Ends").startDate, byTitle("Unit Test 1 Ends").type], ["2026-11-06", "EXAM"]);
  assert.deepEqual([byTitle("Diwali Holiday").startDate, byTitle("Diwali Holiday").type], ["2026-11-12", "HOLIDAY"]);
  assert.equal(byTitle("Results Declaration (Half-Yearly)").type, "RESULT");
  assert.ok(byTitle("Half-Yearly Examination Begins").warnings.some((x) => /more than once/.test(x)), "the repeated row says so");
});

test("STAGE 1 validation: an exam with no 'Ends' row is flagged, not given an invented end date; a paired exam is not flagged", () => {
  const byTitle = (t: string) => preview.events.find((e) => e.title === t)!;
  for (const t of ["Half-Yearly Examination Begins", "Pre-Final Examination Begins"]) {
    const e = byTitle(t);
    assert.equal(e.endDate, "", `${t}: no end date was invented`);
    assert.equal(e.confidence, "review", t);
    assert.ok(e.warnings.some((x) => /No matching ".*Ends" row/.test(x)), `${t} is flagged`);
  }
  assert.ok(!byTitle("Unit Test 1 Begins").warnings.some((x) => /No matching/.test(x)), "Unit Test 1 has both rows");
  assert.ok(!byTitle("Unit Test 1 Ends").warnings.some((x) => /No matching/.test(x)));
});

test("STAGE 1 validation: probable duplicates (same kind, same day, same words) are flagged on BOTH rows and nothing is dropped automatically", () => {
  const a = preview.events.find((e) => e.title === "Results Declaration (Half-Yearly)")!;
  const b = preview.events.find((e) => e.title === "Half-Yearly Results")!;
  assert.ok(a && b, "both rows are still there");
  assert.ok(a.warnings.some((x) => /same event as "Half-Yearly Results"/.test(x)));
  assert.ok(b.warnings.some((x) => /same event as "Results Declaration \(Half-Yearly\)"/.test(x)));
  assert.equal(a.confidence, "review");
});

test("STAGE 1 failures: an unreadable document, a missing AI reader and a reader that fails each give a clear 'could not read', never made-up events", async () => {
  assert.deepEqual(await extractCalendarPreview(new Uint8Array(), "application/pdf", { pdfText: async () => "", reader: null }), { ok: false, error: "That file is empty." });
  const noReader = await extractCalendarPreview(bytes, "image/png", { pdfText: async () => "", reader: null });
  assert.equal(noReader.ok, false);
  assert.match(!noReader.ok ? noReader.error : "", /needs the AI reader/);
  const failing = await extractCalendarPreview(bytes, "image/png", {
    pdfText: async () => "",
    reader: async () => {
      const e = new Error("The AI reader is busy or out of quota right now. Try again later.");
      e.name = "ReaderUnavailableError";
      throw e;
    },
  });
  assert.deepEqual(failing, { ok: false, error: "The AI reader is busy or out of quota right now. Try again later." });
  const nothing = await extractCalendarPreview(bytes, "image/png", { pdfText: async () => "", reader: async () => ({ academicYear: null, candidates: [] }) });
  assert.equal(nothing.ok, false);
  assert.match(!nothing.ok ? nothing.error : "", /No calendar events were found/);
});

test("STAGE 1 validation of the AI reader's answer: a date that disagrees with the text it quotes is replaced by the text's date and flagged", async () => {
  const out = await extractCalendarPreview(bytes, "image/png", {
    pdfText: async () => "",
    reader: async () => ({
      academicYear: "2026-27",
      candidates: [{ origin: "ai", title: "Annual Examination Begins", start: "2027-03-21", end: null, type: "EXAM", sourceText: "12 Mar 2027 Annual Examination Begins", dateConfidence: "high", warnings: [] }],
    }),
  });
  assert.equal(out.ok, true);
  if (!out.ok) return;
  assert.equal(out.events[0].startDate, "2027-03-12", "the document's own text wins");
  assert.equal(out.events[0].confidence, "review");
  assert.ok(out.events[0].warnings.some((x) => /differs from the one proposed/.test(x)));
});

// ---- Stage 2: admin review, saved as drafts ---------------------------------------------------------------------------------------------------------------

test("STAGE 2 review and save: the administrator drops the duplicate and supplies the end date; the rest is saved as DRAFTS for the chosen audience only", async () => {
  const reviewed = preview.events.filter((e) => e.title !== "Half-Yearly Results").map((e) => (e.title === "Half-Yearly Examination Begins" ? { ...e, endDate: "2026-11-24" } : e));
  const res = await confirmCalendarImportCore(db, SUPER, { scope: SCOPE, sourceName: "calendar.pdf", events: toImport(reviewed) });
  assert.equal(res.ok && res.created, 6);
  assert.equal(w.events.length, 6);
  for (const e of w.events) {
    assert.equal(e.isPublished, false, `${e.title} is a draft`);
    assert.deepEqual([e.schoolId, e.boardId, e.schoolClassId], ["demo", "bse", "c10"]);
  }
  draftIds = w.events.map((e) => e.id);
  const again = await confirmCalendarImportCore(db, SUPER, { scope: SCOPE, events: toImport(reviewed) });
  assert.deepEqual(again.ok && [again.created, again.skipped.length], [0, 6], "importing the same calendar again creates nothing");
  assert.equal(w.events.length, 6);
});

// ---- Stage 3: drafts are invisible --------------------------------------------------------------------------------------------------------------------------

test("STAGE 3 drafts stay hidden: no student sees a next exam or an exam-aware plan while the events are drafts", async () => {
  for (const id of ["s1", "s2", "s3"]) assert.equal(await findNextExamAt(db, w.students[id], NOW), null, `${id} sees no exam`);
  assert.deepEqual(await listUpcomingExams(db, w.students.s1, TODAY), []);
  const plan = await generate("s1");
  assert.equal(plan?.mode, "general", "with only drafts, s1's plan is the general one");
  assert.ok(titlesOf("s1").every((t) => !/ for /.test(t)));
});

// ---- Stage 4: publishing and targeting -----------------------------------------------------------------------------------------------------------------------

test("STAGE 4 bulk publish: another school's administrator cannot publish them; the owning school's administrator publishes all in one step with ONE notification for the audience", async () => {
  const other = await publishManyAcademicEventsCore(db, OTHER_ADMIN, draftIds);
  assert.deepEqual(other.ok && [other.data!.published, other.data!.skipped], [0, 6]);
  assert.ok(w.events.every((e) => !e.isPublished));

  const res = await publishManyAcademicEventsCore(db, DEMO_ADMIN, draftIds);
  assert.deepEqual(res.ok && [res.data!.published, res.data!.skipped], [6, 0]);
  assert.ok(w.events.every((e) => e.isPublished));
  assert.equal(w.audit.filter((a) => a.resource === "AcademicEventPublish").length, 1, "one audit entry for the one real publish (the other school's attempt published nothing and logged nothing)");

  const digests = calendarPublishDigests(res.data!.events);
  assert.equal(digests.length, 1, "ONE notification for the one audience, not six");
  assert.deepEqual(digests[0].scope, SCOPE);
  assert.equal(digests[0].type, "EXAM");
  assert.match(digests[0].message, /6 events were added, from 2026-11-01: Unit Test 1 Begins; Unit Test 1 Ends; Diwali Holiday; and 3 more\./);
  const repeat = await publishManyAcademicEventsCore(db, DEMO_ADMIN, draftIds);
  assert.deepEqual(repeat.ok && [repeat.data!.published, repeat.data!.skipped], [0, 6], "publishing again changes nothing");
});

test("STAGE 4 targeting: only the Class 10 students of the Demo School get the exams - not Class 9, not another school, not students with incomplete records", async () => {
  const next = await findNextExamAt(db, w.students.s1, NOW);
  assert.equal(next?.label, "Unit Test 1");
  assert.deepEqual([next?.startDate, next?.endDate, next?.daysUntil, next?.status], ["2026-11-01", "2026-11-06", 12, "upcoming"], "the correct next exam, as a date range, counted from the Indian date");
  for (const id of ["s2", "s3", "s4", "s5", "s6"]) assert.equal(await findNextExamAt(db, w.students[id], NOW), null, `${id} is not in the audience`);
});

// ---- Stage 5: plans -----------------------------------------------------------------------------------------------------------------------------------------------

test("STAGE 5 the plan the student already had is reported out of date, in words, once the exams are published (and it is not changed by being checked)", async () => {
  const before = JSON.stringify(w.planOf("s1")?.items);
  const advice = await previewPlanAdviceCore(db, "s1", NOW);
  assert.equal(advice.stale, true);
  assert.ok(advice.notes.some((n) => /Your study plan is out of date: it does not include Unit Test 1/.test(n) && /completed and past tasks are kept/.test(n)));
  assert.equal(JSON.stringify(w.planOf("s1")?.items), before, "reading the advice writes nothing");
});

test("STAGE 5 student 1 (Class 10): an exam-aware, subject- and chapter-level plan - weak topic first, revision last, nothing during the exam", async () => {
  const s = await generate("s1");
  assert.equal(s?.mode, "exam-aware");
  const items = w.futureItems("s1", TODAY_START);
  const titles = items.map((i) => i.title);
  assert.deepEqual(new Set(items.map((i) => i.subject)), new Set(["Mathematics", "Physical Science", "English", "Hindi"]));
  assert.ok(titles.includes("Study: Polynomials · for Unit Test 1"));
  assert.ok(titles.includes("Study: Light · for Unit Test 1"));
  assert.equal(items.find((i) => i.kind === "TOPIC")?.title, "Review weak topic: Discriminant (Quadratic Equations) · for Unit Test 1", "the verified weak topic comes first");
  const forUnitTest = items.filter((i) => /for Unit Test 1$/.test(i.title));
  assert.ok(forUnitTest.every((i) => i.date >= TODAY_START && i.date < dayStart("2026-11-01")), "preparation is finished before the exam starts");
  assert.ok(items.every((i) => i.date < dayStart("2026-11-01") || i.date > dayStart("2026-11-06")), "no task during the exam dates (1-6 Nov)");
  assert.ok(items.some((i) => /for Half-Yearly Examination$/.test(i.title) && i.date >= dayStart("2026-11-07")), "preparation for the next exam resumes after the first one ends");
  assert.ok(items.filter((i) => i.kind === "REVISION").every((i) => i.date >= dayStart("2026-10-29")), "revision comes in the last days before the exam");
  assert.ok(titles.includes("Study: Hindi textbook · for Unit Test 1"), "a subject with no chapter list becomes one honest general task");
  assert.ok(s!.coverageNotes.some((n) => /no chapter list is set up yet for Hindi/.test(n)), "and the student is told why");
  assert.ok(s!.coverageNotes.some((n) => /does not say which subjects or chapters/.test(n)), "the exam's scope is not claimed to be known");
});

test("STAGE 5 student 2 (Class 9, different subjects and chapters, no published exam): a different, general plan - no Class 10 content, no exam named", async () => {
  const s = await generate("s2");
  assert.equal(s?.mode, "general");
  const items = w.futureItems("s2", TODAY_START);
  assert.deepEqual(new Set(items.filter((i) => i.kind === "TOPIC").map((i) => i.subject)), new Set(["Social Studies", "Mathematics"]));
  const titles = items.map((i) => i.title);
  assert.ok(titles.includes("Study: Number Systems") && titles.includes("Study: The French Revolution"));
  assert.ok(titles.every((t) => !/Real Numbers|Polynomials|Light|Unit Test/.test(t)), "nothing from Class 10, and no exam");
  assert.equal(items.find((i) => i.kind === "TOPIC")?.title, "Review: Himalayan rivers", "student 2's own weak topic first");
  const overlap = titlesOf("s1").filter((t) => titlesOf("s2").includes(t));
  assert.deepEqual(overlap.filter((t) => !/^Revision|^Mock/.test(t)), [], "the two plans share no study tasks");
});

test("STAGE 5 incomplete records are surfaced honestly, never papered over: no school, no board, no class", async () => {
  const s4 = await generate("s4");
  assert.match(s4!.notes.join(" "), /haven't been placed in a school yet/);
  assert.equal(s4!.mode, "general");
  const s5 = await generate("s5");
  assert.match(s5!.notes.join(" "), /no board set/);
  assert.equal(await generate("s6"), null, "no class: no plan is built");
  const advice6 = await previewPlanAdviceCore(db, "s6", NOW);
  assert.match(advice6.notes.join(" "), /class has not been set up yet/);
  assert.ok(w.planOf("s6") === null, "nothing was written for a student with no class");
  const advice1 = await previewPlanAdviceCore(db, "s1", NOW);
  assert.ok(!advice1.notes.some((n) => /placed in a school|no board/.test(n)), "a complete record gets no placement warning");
});

test("STAGE 5 a student at another school with the same class gets no Demo School exam (isolation) and the plan says it is general", async () => {
  const s = await generate("s3");
  assert.equal(s?.mode, "general");
  assert.ok(titlesOf("s3").every((t) => !/Unit Test/.test(t)));
});

// ---- Stage 6: progress changes, regeneration, failure --------------------------------------------------------------------------------------------------------

test("STAGE 6 progress changes: completed work survives, past work is untouched, and the next plan follows the NEW weak topic (no duplicates)", async () => {
  const plan = w.planOf("s1")!;
  const [first, second] = plan.items.filter((i) => i.date >= TODAY_START).sort((a, b) => a.date.getTime() - b.date.getTime());
  first.completed = true;
  second.completed = true;
  const doneIds = [first.id, second.id];
  plan.items.push({ id: "old-1", studyPlanId: plan.id, day: 1, date: dayStart("2026-10-15"), kind: "TOPIC", subject: "English", title: "Study: A past task", durationMinutes: 40, priority: "MEDIUM", completed: false });
  w.weak.s1 = [weakLight]; // the student improved in Quadratics and is now weak in Light
  await generate("s1");
  const after = w.planOf("s1")!.items;
  for (const id of doneIds) assert.ok(after.some((i) => i.id === id && i.completed), "a completed task is kept, with the same row");
  assert.ok(after.some((i) => i.id === "old-1"), "a past task is kept");
  const future = w.futureItems("s1", TODAY_START).filter((i) => !i.completed);
  assert.equal(future.find((i) => i.kind === "TOPIC")?.title, "Review weak topic: Refraction (Light) · for Unit Test 1", "the plan now starts from the new weak topic");
  assert.ok(!future.some((i) => /Discriminant/.test(i.title)), "the recovered topic is no longer a weak-topic task");
  const keys = after.map((i) => `${i.date.getTime()}|${i.title}`);
  assert.equal(new Set(keys).size, keys.length, "no duplicates");
  const count = after.length;
  await generate("s1");
  assert.equal(w.planOf("s1")!.items.length, count, "generating again changes nothing");
});

test("STAGE 6 failure: if the exam data cannot be read, generation fails and the student's plan is exactly as it was", async () => {
  const snapshot = JSON.stringify(w.planOf("s1"));
  const writes = { ...w.calls };
  w.failAcademicReads = true;
  await assert.rejects(() => generate("s1"), /simulated database failure/);
  await assert.rejects(() => findNextExamAt(db, w.students.s1, NOW), /simulated database failure/, "and the Next Exam lookup says it could not look, instead of 'no exam'");
  w.failAcademicReads = false;
  assert.equal(JSON.stringify(w.planOf("s1")), snapshot);
  assert.deepEqual([w.calls.planCreates, w.calls.planItemCreates, w.calls.planItemDeletes], [writes.planCreates, writes.planItemCreates, writes.planItemDeletes]);
});

test("STAGE 6 once regenerated, the plan is no longer reported out of date", async () => {
  const advice = await previewPlanAdviceCore(db, "s1", NOW);
  assert.equal(advice.stale, false);
});

test("an exam being published late changes only the future: a student with a general plan keeps their completed tasks when exam dates arrive (s2 gets a class 9 exam)", async () => {
  const plan = w.planOf("s2")!;
  const done = plan.items.filter((i) => i.date >= TODAY_START).sort((a, b) => a.date.getTime() - b.date.getTime())[0];
  done.completed = true;
  w.events.push({ id: "ev-c9", title: "Class 9 Test Begins", type: "EXAM", startDate: new Date("2026-11-03T00:00:00Z"), endDate: null, description: null, academicYear: "2026-27", isPublished: true, schoolId: "demo", boardId: "bse", schoolClassId: "c9", createdByUserId: "x" });
  const s = await generate("s2");
  assert.equal(s?.mode, "exam-aware");
  assert.ok(w.planOf("s2")!.items.some((i) => i.id === done.id && i.completed));
  assert.ok(titlesOf("s2").some((t) => /for Class 9 Test$/.test(t)));
  assert.equal((await findNextExamAt(db, w.students.s1, NOW))?.label, "Unit Test 1", "student 1's countdown is unaffected by a Class 9 event");
});
