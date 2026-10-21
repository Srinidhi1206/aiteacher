// Offline tests for the chapter-scoped subject page (lib/study-plan/chapter-scope.ts + app/(app)/subjects/[subject]/page.tsx), with NO curriculum registry and no database: the data is a small hand-made subject.
// A Study Plan task about one chapter opens /subjects/<id>?chapter=<chapterId>: that page shows ONLY the chapter (its own subtopics and materials), keeps working on a refresh or a shared link, and can never show a chapter of
// another subject. A task about the whole subject still opens every chapter. The pages are rendered to static HTML with their data stubbed.
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { parseChapterScope, chapterScopeHref, scopeChapters, CHAPTER_PARAM } from "@/lib/study-plan/chapter-scope";
import { taskLink, taskScope, type LinkSubject } from "@/lib/study-plan/task-links";

const here = (p: string) => new URL(`../${p}`, import.meta.url).href;
(globalThis as unknown as { React: typeof React }).React = React;

class NotFound extends Error {}
mock.module("next/navigation", { namedExports: { useRouter: () => ({ push() {}, replace() {}, refresh() {}, back() {} }), notFound: () => { throw new NotFound(); } } });
mock.module(here("components/layout/topbar.tsx"), { namedExports: { Topbar: ({ title }: { title: string }) => React.createElement("h1", null, title) } });

type Topic = { id: string; name: string; bloomLevel: string; status: null; mastery: null };
const topic = (id: string, name: string): Topic => ({ id, name, bloomLevel: "UNDERSTAND", status: null, mastery: null });
const material = (id: string, title: string) => ({ id, title, fileUrl: `https://blob.test/${id}.pdf`, materialType: "STUDY_MATERIAL", chapterId: null, topicId: null });
const MATHS = {
  id: "maths",
  name: "Mathematics",
  classLabel: "Class 10",
  subjectMaterials: [material("book", "Mathematics textbook")],
  chapters: [
    { id: "c-real", name: "Real Numbers", topics: [topic("t-fta", "Fundamental Theorem of Arithmetic"), topic("t-irr", "Irrational Numbers"), topic("t-exp", "Exponentials Revisited")], materials: [material("m-real", "Real Numbers worksheet")], textbook: null },
    { id: "c-sets", name: "Sets", topics: [topic("t-venn", "Venn Diagrams")], materials: [material("m-sets", "Sets notes")], textbook: null },
    { id: "c-poly", name: "Polynomials", topics: [topic("t-zero", "Zeroes of a Polynomial")], materials: [], textbook: null },
    { id: "c-prob", name: "Probability", topics: [], materials: [], textbook: null },
  ],
};
const ENGLISH_CHAPTER_ID = "u-english-1"; // a chapter of ANOTHER subject
mock.module(here("lib/actions/student-curriculum.ts"), { namedExports: { getMySubject: async (id: string) => (id === "maths" ? MATHS : null), getMyTopic: async () => null, getMySubjects: async () => ({ subjects: [] }) } });

const SubjectPage = async () => (await import("@/app/(app)/subjects/[subject]/page")).default as (p: { params: { subject: string }; searchParams?: { chapter?: string | string[] } }) => Promise<React.ReactElement>;
const render = async (chapter?: string | string[]) => renderToStaticMarkup(await (await SubjectPage())({ params: { subject: "maths" }, searchParams: chapter === undefined ? undefined : { chapter } }));
const hrefs = (html: string) => [...html.matchAll(/<a\b[^>]*\bhref="([^"]*)"/g)].map((m) => m[1].replace(/&amp;/g, "&"));
const cards = (html: string) => (html.match(/<details open/g) ?? []).length;

test("the scope helpers: ids from a repeated or comma-separated parameter, nothing implausible, duplicates once; hrefs; the whole subject when nothing is asked", () => {
  assert.equal(CHAPTER_PARAM, "chapter");
  assert.deepEqual(parseChapterScope(undefined), []);
  assert.deepEqual(parseChapterScope("a"), ["a"]);
  assert.deepEqual(parseChapterScope(["a", "b"]), ["a", "b"]);
  assert.deepEqual(parseChapterScope("a,b, a ,c"), ["a", "b", "c"]);
  assert.deepEqual(parseChapterScope(["x y", "<script>", "../etc", "ok-1_2", ""]), ["ok-1_2"], "only plausible ids survive");
  assert.equal(parseChapterScope(Array.from({ length: 80 }, (_, i) => `c${i}`)).length, 30, "capped");
  assert.equal(chapterScopeHref("s1", []), "/subjects/s1");
  assert.equal(chapterScopeHref("s1", ["c1"]), "/subjects/s1?chapter=c1");
  assert.equal(chapterScopeHref("s1", ["c1", "c2"]), "/subjects/s1?chapter=c1&chapter=c2");
  assert.equal(chapterScopeHref("s1", ["bad id", "c1"]), "/subjects/s1?chapter=c1");
  const chapters = [{ id: "a" }, { id: "b" }, { id: "c" }];
  assert.equal(scopeChapters(chapters, []).shown.length, 3);
  assert.deepEqual(scopeChapters(chapters, ["c"]).shown.map((x) => [x.chapter.id, x.number]), [["c", 3]], "a scoped chapter keeps its number in the whole subject");
  assert.deepEqual(scopeChapters(chapters, ["c", "a"]).shown.map((x) => x.chapter.id), ["a", "c"], "the book's order, not the request's");
  const none = scopeChapters(chapters, ["zzz"]);
  assert.deepEqual([none.scoped, none.unknownIds, none.shown.length], [false, ["zzz"], 3]);
});

test("selected chapter: only that chapter is shown, with exactly its own subtopics and materials, its place in the book, and a way back to every chapter", async () => {
  const html = await render("c-real");
  assert.equal(cards(html), 1, "one chapter card, not four");
  assert.match(html, /Showing 1 of 4 chapters/);
  assert.match(html, /1\.<\/span>Real Numbers/);
  assert.deepEqual(hrefs(html).filter((h) => h.startsWith("/subjects/maths/")), ["/subjects/maths/t-fta", "/subjects/maths/t-irr", "/subjects/maths/t-exp"], "exactly Real Numbers' three subtopics");
  assert.ok(!html.includes("Sets") && !html.includes("Polynomials") && !html.includes("Probability") && !html.includes("Venn Diagrams") && !html.includes("Zeroes of a Polynomial"), "nothing from any other chapter");
  assert.match(html, /Real Numbers worksheet/);
  assert.ok(!html.includes("Sets notes"), "another chapter's material is not shown");
  assert.match(html, /Mathematics textbook/, "the whole-subject textbook stays available");
  assert.ok(hrefs(html).includes("/subjects/maths"), "a link back to the whole subject");
  assert.match(html, /Show all 4 chapters/);
  assert.match(await render("c-prob"), /4\.<\/span>Probability/, "a later chapter keeps its real number");
});

test("deep links and refresh: the same URL always shows the same chapter; several chapters (repeated or comma-separated) show exactly those, in the book's order; no parameter shows everything as before", async () => {
  const a = await render("c-real");
  assert.equal(await render("c-real"), a, "a refresh changes nothing");
  const two = await render(["c-poly", "c-real"]);
  assert.equal(cards(two), 2);
  assert.ok(two.indexOf("Real Numbers") < two.indexOf("Polynomials") && !two.includes("Venn Diagrams"), "only those two, in the book's order");
  assert.equal(await render("c-real,c-poly"), two, "comma-separated means the same");
  assert.equal(await render(["c-real", "c-real"]), a, "a repeated id is one chapter");
  const all = await render();
  assert.equal(cards(all), 4);
  assert.match(all, /4 chapters/);
  assert.ok(!all.includes("Show all"), "the unscoped page has no 'show all' link");
});

test("a chapter id that belongs to another subject (or to nothing) never shows that chapter: the page says so and shows this subject's own chapters", async () => {
  for (const foreign of [ENGLISH_CHAPTER_ID, "no-such-chapter", "other-board-ch1"]) {
    const html = await render(foreign);
    assert.match(html, /named a chapter this subject does not have/, foreign);
    assert.equal(cards(html), 4, "this subject's own chapters, nothing else");
  }
  const mixed = await render(["c-sets", ENGLISH_CHAPTER_ID]);
  assert.equal(cards(mixed), 1, "a valid id next to a foreign one: only the valid chapter");
  assert.match(mixed, /Sets/);
  assert.ok(!mixed.includes("named a chapter this subject does not have"));
});

test("a Study Plan task about one chapter opens only that chapter; a whole-subject task still opens the whole subject", async () => {
  const curriculum: LinkSubject[] = [{ id: MATHS.id, name: MATHS.name, chapters: MATHS.chapters.map((c) => ({ id: c.id, name: c.name, topics: c.topics.map((t) => ({ id: t.id, name: t.name })) })) }];
  const task = { title: "Study: Real Numbers · for Unit Test 2", subject: "Mathematics" };
  assert.deepEqual(taskScope(task, curriculum), { subjectId: "maths", chapterId: "c-real", topicId: null });
  const link = taskLink(task, curriculum)!;
  assert.equal(link.href, "/subjects/maths?chapter=c-real");
  const page = await render(new URL(link.href, "https://preview.test").searchParams.getAll(CHAPTER_PARAM));
  assert.equal(cards(page), 1);
  assert.match(page, /Real Numbers/);
  assert.equal(hrefs(page).filter((h) => h.startsWith("/subjects/maths/")).length, 3);
  assert.ok(!page.includes("Sets") && !page.includes("Polynomials"));
  assert.equal(taskScope({ title: "Revise: Mathematics · for Unit Test 2", subject: "Mathematics" }, curriculum), null, "no chapter, no scope: the subject link covers it");
  assert.equal(cards(await render()), 4, "...and opens every chapter");
});
