// Offline tests for where a Study Plan task takes the student (lib/study-plan/task-links.ts): the chapter or topic the task is about - only when that is unambiguous - and nothing otherwise.
// Pure matching, the Study Plan page rendered to static markup, the student-scoped curriculum read against an in-memory database, and the subject page's chapter anchors.
// No real database, network or AI.
import { test, mock, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { taskLink, taskScope, chapterAnchor, type LinkSubject } from "@/lib/study-plan/task-links";
import { addDays, dayStart, todayInIndia } from "@/lib/calendar/day";

const here = (p: string) => new URL(`../${p}`, import.meta.url).href;
(globalThis as unknown as { React: typeof React }).React = React;

const CURRICULUM: LinkSubject[] = [
  {
    id: "maths",
    name: "Mathematics",
    chapters: [
      { id: "c-real", name: "Real Numbers", topics: [] }, // a chapter with no lesson records yet
      { id: "c-poly", name: "Polynomials", topics: [{ id: "t-zeroes", name: "Zeroes" }, { id: "t-graphs", name: "Graphs" }] },
      { id: "c-quad", name: "Quadratic Equations", topics: [{ id: "t-roots", name: "Roots" }, { id: "t-roots-2", name: "Roots" }] }, // two lessons with the same name
    ],
  },
  {
    id: "eng",
    name: "English",
    chapters: [{ id: "u1", name: "Unit 1: Personality Development", topics: [{ id: "t-attitude", name: "Attitude Is Altitude" }, { id: "t-grit", name: "Grit" }] }],
  },
  { id: "sci-a", name: "Science", chapters: [{ id: "x1", name: "Light", topics: [] }] },
  { id: "sci-b", name: "Science", chapters: [{ id: "x2", name: "Light", topics: [] }] }, // two subjects with the same name
];
const link = (title: string, subject: string) => taskLink({ title, subject }, CURRICULUM);

test("a chapter task links to that chapter (the subject page narrowed to it), for a study task, a chapter revision and the general plan alike", () => {
  const expected = { href: "/subjects/maths?chapter=c-poly", label: "Open chapter" };
  assert.deepEqual(link("Study: Polynomials · for Unit Test 2", "Mathematics"), expected);
  assert.deepEqual(link("Study: Polynomials", "Mathematics"), expected);
  assert.deepEqual(link("Revise chapter: Polynomials · for Unit Test 2", "Mathematics"), expected);
  assert.deepEqual(link("Revise chapter: Polynomials", "Mathematics"), expected);
  assert.deepEqual(link("study: POLYNOMIALS".replace("study", "Study"), "mathematics"), expected, "names are matched without regard to case");
  assert.equal(chapterAnchor("c-poly"), "chapter-c-poly");
});

test("a weak-topic task links to the topic page when the topic can be told apart, and to its chapter when it cannot", () => {
  assert.deepEqual(link("Review weak topic: Zeroes (Polynomials) · for Unit Test 2", "Mathematics"), { href: "/subjects/maths/t-zeroes", label: "Open topic" });
  assert.deepEqual(link("Review weak topic: Roots (Quadratic Equations) · for Unit Test 2", "Mathematics"), { href: "/subjects/maths?chapter=c-quad", label: "Open chapter" }, "two lessons called Roots: the chapter, not a guess");
  assert.equal(link("Review weak topic: Zeroes (Algebra) · for X", "Mathematics"), null, "a chapter the subject does not have");
});

test("the general plan's topic review links to the topic only when exactly one topic of the subject has that name", () => {
  assert.deepEqual(link("Review: Attitude Is Altitude", "English"), { href: "/subjects/eng/t-attitude", label: "Open topic" });
  assert.equal(link("Review: Roots", "Mathematics"), null, "two topics are called Roots");
  assert.equal(link("Review: Nothing like this", "Mathematics"), null);
});

test("a task's scope is its chapter's database id (and its topic's, when it is one topic): the Real Numbers task is scoped to Real Numbers; a whole-subject task has no scope", () => {
  assert.deepEqual(taskScope({ title: "Study: Real Numbers · for Unit Test 2", subject: "Mathematics" }, CURRICULUM), { subjectId: "maths", chapterId: "c-real", topicId: null });
  assert.deepEqual(taskScope({ title: "Review weak topic: Zeroes (Polynomials) · for Unit Test 2", subject: "Mathematics" }, CURRICULUM), { subjectId: "maths", chapterId: "c-poly", topicId: "t-zeroes" });
  assert.deepEqual(taskScope({ title: "Review: Attitude Is Altitude", subject: "English" }, CURRICULUM), { subjectId: "eng", chapterId: "u1", topicId: "t-attitude" });
  assert.equal(taskScope({ title: "Revise: Mathematics · for Unit Test 2", subject: "Mathematics" }, CURRICULUM), null, "a whole-subject task keeps covering the whole subject");
  assert.equal(taskScope({ title: "Study: Light", subject: "Science" }, CURRICULUM), null, "an ambiguous subject is never guessed");
  assert.equal(taskScope({ title: "Mock test - mixed topics", subject: "All subjects" }, CURRICULUM), null);
});

test("nothing is linked when the match is uncertain: unknown subject or chapter, a subject name two subjects share, subject-level tasks, mock tests", () => {
  assert.equal(link("Study: Polynomials", "Chemistry"), null, "no such subject");
  assert.equal(link("Study: Geometry", "Mathematics"), null, "no such chapter");
  assert.equal(link("Study: Light", "Science"), null, "two subjects are called Science");
  assert.equal(link("Revise: Mathematics · for Unit Test 2", "Mathematics"), null, "a subject-level task: the page's subject link covers it");
  assert.equal(link("Mock test - mixed topics", "All subjects"), null);
  assert.equal(link("Revision - recap this week's topics", "All subjects"), null);
  assert.deepEqual(taskLink({ title: "Study: Polynomials", subject: "Mathematics" }, []), null, "no curriculum data, no link");
});

test("the exam name in a title never changes where a task links: a chapter is found by its own name, not by the exam's", () => {
  for (const exam of ["Unit Test 2", "Mid-Term Examination", "Semester 1 Examination", "Pre-Final", "Polynomials Quiz"]) {
    assert.deepEqual(link(`Study: Real Numbers · for ${exam}`, "Mathematics"), { href: "/subjects/maths?chapter=c-real", label: "Open chapter" }, exam);
  }
});

// ---- on the Study Plan page ----------------------------------------------------------------------------------------------------------------------------------------------

mock.module("next/navigation", { namedExports: { useRouter: () => ({ push() {}, replace() {}, refresh() {}, back() {} }) } });
mock.module(here("lib/actions/analytics.ts"), { namedExports: { completeLearningPathItem: async () => ({ ok: true }), getMyLearningPath: async () => null, getMyWeakAreas: async () => [] } });
mock.module(here("components/dashboard/generate-learning-path-button.tsx"), { namedExports: { GenerateLearningPathButton: () => React.createElement("button", null, "Generate my learning path") } });
let View: typeof import("@/components/study-plan/real-learning-path-view").RealLearningPathView;
before(async () => {
  View = (await import("@/components/study-plan/real-learning-path-view")).RealLearningPathView;
});
let n = 0;
const item = (subject: string, title: string, completed = false) => ({ id: `i${++n}`, studyPlanId: "p", day: 1, date: dayStart(addDays(todayInIndia(), 2)), dateKey: addDays(todayInIndia(), 2), kind: "TOPIC", subject, title, durationMinutes: 40, priority: "MEDIUM", completed });
const render = (items: ReturnType<typeof item>[], curriculum = CURRICULUM) =>
  renderToStaticMarkup(React.createElement(View, { learningPath: { id: "p", studentId: "s", createdAt: new Date(), items } as never, weakAreas: [], planNotes: [], subjectLinks: { Mathematics: "maths", English: "eng" }, curriculum }));

test("the Study Plan page links each task to its own chapter or topic, keeps the subject link, and gives a task that cannot be matched only the subject link", () => {
  const h = render([
    item("Mathematics", "Study: Polynomials · for Unit Test 2"),
    item("Mathematics", "Review weak topic: Zeroes (Polynomials) · for Unit Test 2"),
    item("Mathematics", "Revise: Mathematics · for Unit Test 2"),
    item("English", "Study: Geometry · for Unit Test 2"),
  ]);
  assert.match(h, /href="\/subjects\/maths\?chapter=c-poly"[^>]*>\s*Chapters &amp; materials/, "a chapter task: Chapters & materials opens THAT chapter");
  assert.match(h, /href="\/subjects\/maths\/t-zeroes"[^>]*>\s*Open topic/);
  assert.equal((h.match(/Open chapter/g) ?? []).length, 0, "the chapter link IS the Chapters & materials link: no second link to the same place");
  assert.equal((h.match(/Open topic/g) ?? []).length, 1);
  assert.equal((h.match(/Chapters &amp; materials/g) ?? []).length, 4, "every task that has a subject page keeps a Chapters & materials link");
  assert.equal((h.match(/href="\/subjects\/maths\?chapter=c-poly"/g) ?? []).length, 2, "the chapter task and the weak-topic task (its topic is in the same chapter) both open Polynomials only");
  assert.equal((h.match(/href="\/subjects\/maths"/g) ?? []).length, 1, "the whole-subject task still opens the whole subject");
  assert.equal((h.match(/href="\/subjects\/eng"/g) ?? []).length, 1, "a task that cannot be matched still opens its subject");
  assert.equal((h.match(/Ask Tutor/g) ?? []).length, 4);
  const without = render([item("Mathematics", "Study: Polynomials · for Unit Test 2")], []);
  assert.ok(!/Open chapter|Open topic/.test(without), "no curriculum data: no chapter or topic link, nothing broken");
});

// ---- the student's own curriculum, and the anchors ----------------------------------------------------------------------------------------------------------------------

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
let session: { id: string; role: string } | null = null;
const queries: Row[] = [];
class UnauthorizedError extends Error {}
class ForbiddenError extends Error {}
const students: Record<string, Row> = {
  a: { id: "sA", userId: "uA", schoolId: "demo", schoolClassId: "c10", boardId: "bse", schoolClass: { label: "Class 10", board: { shortName: "BSE" } } },
  noClass: { id: "sN", userId: "uN", schoolId: "demo", schoolClassId: null, boardId: "bse", schoolClass: null },
};
const prisma = {
  student: { findUnique: async ({ where }: { where: { userId: string } }) => Object.values(students).find((s) => s.userId === where.userId) ?? null },
  schoolClassSubject: {
    findMany: async (args: Row) => {
      queries.push(args);
      return [{ subject: { id: "maths", name: "Mathematics", chapters: [{ id: "c1", name: "Real Numbers", topics: [] }] } }];
    },
  },
};
mock.module("server-only", { namedExports: {} });
mock.module(here("lib/prisma.ts"), { namedExports: { prisma } });
mock.module(here("lib/auth/current-session.ts"), {
  namedExports: {
    UnauthorizedError,
    ForbiddenError,
    getCurrentSession: async () => session,
    requireRole: async (role: string) => {
      if (!session) throw new UnauthorizedError("You must be signed in.");
      if (session.role !== role) throw new ForbiddenError("Not allowed.");
      return session;
    },
  },
});
mock.module(here("lib/materials/scope.ts"), { namedExports: { studentMaterialWhere: () => null } });

test("the curriculum links are read for the student's OWN class and its enabled subjects only, never from a client value; a student with no class gets none; only a student can ask", async () => {
  const { getMyCurriculumLinks } = await import("@/lib/actions/student-curriculum");
  session = { id: "uA", role: "student" };
  queries.length = 0;
  const links = await getMyCurriculumLinks();
  assert.deepEqual(links.map((s) => s.name), ["Mathematics"]);
  assert.equal(queries[0].where.schoolClassId, "c10");
  assert.equal(queries[0].where.isEnabled, true);
  assert.equal(JSON.stringify(queries[0].select).includes("fileUrl"), false, "names and ids only - no file links");
  session = { id: "uN", role: "student" };
  queries.length = 0;
  assert.deepEqual(await getMyCurriculumLinks(), []);
  assert.equal(queries.length, 0, "no class, no query");
  session = null;
  await assert.rejects(() => getMyCurriculumLinks(), UnauthorizedError);
  session = { id: "t1", role: "teacher" };
  await assert.rejects(() => getMyCurriculumLinks(), ForbiddenError);
});

test("the subject page gives every chapter card the anchor a task links to, and the Study Plan page hands the view the curriculum", () => {
  const subjectPage = fs.readFileSync(new URL("../app/(app)/subjects/[subject]/page.tsx", import.meta.url), "utf8");
  assert.match(subjectPage, /<Card key=\{chapter\.id\} id=\{chapterAnchor\(chapter\.id\)\}/);
  const planPage = fs.readFileSync(new URL("../app/(app)/study-plan/page.tsx", import.meta.url), "utf8");
  assert.match(planPage, /getMyCurriculumLinks\(\)\.catch\(\(\) => \[\]\)/, "a failed read leaves the page without those links");
  assert.match(planPage, /curriculum=\{curriculum\}/);
});
