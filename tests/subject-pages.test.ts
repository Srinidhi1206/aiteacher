// Offline tests for what a student SEES on the subject and topic pages once chapters carry topics: ordered, openable chapters with their topic links, a clear message where a chapter has no topics yet, a link into the
// textbook at the chapter's page only when one is verified, and English's existing flow (unit -> lesson -> lesson page) unchanged. The pages are rendered to static HTML with their data stubbed. No database or network.
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const here = (p: string) => new URL(`../${p}`, import.meta.url).href;
(globalThis as unknown as { React: typeof React }).React = React;

class NotFound extends Error {}
mock.module("next/navigation", { namedExports: { useRouter: () => ({ push() {}, replace() {}, refresh() {}, back() {} }), notFound: () => { throw new NotFound(); } } });
mock.module(here("components/layout/topbar.tsx"), { namedExports: { Topbar: ({ title }: { title: string }) => React.createElement("h1", null, title) } });
mock.module(here("lib/actions/practice.ts"), { namedExports: { startPractice: async () => ({ ok: false }) } });

type Chapter = { id: string; name: string; topics: { id: string; name: string; bloomLevel: string; status: "WEAK" | "DEVELOPING" | "STRONG" | null; mastery: number | null }[]; materials: unknown[]; textbook: { materialId: string; title: string; fileUrl: string; page: number } | null };
const topic = (id: string, name: string, status: "WEAK" | "DEVELOPING" | "STRONG" | null = null) => ({ id, name, bloomLevel: "UNDERSTAND", status, mastery: null });
const book = { materialId: "b", title: "Mathematics Class 10", fileUrl: "https://blob.test/maths.pdf", page: 11 };
let subject: { id: string; name: string; classLabel: string; subjectMaterials: unknown[]; chapters: Chapter[] } | null;
let topicData: Record<string, unknown> | null;
mock.module(here("lib/actions/student-curriculum.ts"), { namedExports: { getMySubject: async () => subject, getMyTopic: async () => topicData, getMySubjects: async () => ({ subjects: [] }) } });

const hrefs = (html: string) => [...html.matchAll(/<a\b[^>]*\bhref="([^"]*)"/g)].map((m) => m[1].replace(/&amp;/g, "&"));
const SubjectPage = async () => (await import("@/app/(app)/subjects/[subject]/page")).default;
const TopicPage = async () => (await import("@/app/(app)/subjects/[subject]/[topic]/page")).default;

test("each chapter is an openable card in the book's order: its topics link to their pages, the count is shown, and a chapter with no topics says so", async () => {
  subject = {
    id: "maths",
    name: "Mathematics",
    classLabel: "Class 10",
    subjectMaterials: [],
    chapters: [
      { id: "c1", name: "Real Numbers", topics: [topic("t1", "The Fundamental Theorem of Arithmetic", "STRONG"), topic("t2", "Irrational Numbers")], materials: [], textbook: book },
      { id: "c2", name: "Sets", topics: [], materials: [], textbook: { ...book, page: 40 } },
      { id: "c3", name: "Polynomials", topics: [], materials: [], textbook: null },
    ],
  };
  const html = renderToStaticMarkup(await (await SubjectPage())({ params: { subject: "maths" } }));
  assert.equal((html.match(/<details open/g) ?? []).length, 3, "every chapter opens and closes, open by default so a link to it lands on its topics");
  assert.ok(html.indexOf("Real Numbers") < html.indexOf("Sets") && html.indexOf("Sets") < html.indexOf("Polynomials"), "chapters in the book's order");
  assert.match(html, /1\.<\/span>Real Numbers/);
  assert.match(html, /2 topics/);
  assert.equal((html.match(/Studied as one unit/g) ?? []).length, 2);
  assert.deepEqual(hrefs(html).filter((h) => h.startsWith("/subjects/maths/")), ["/subjects/maths/t1", "/subjects/maths/t2"], "each topic title opens its own topic page");
  assert.match(html, /Needs work|Mastered/, "the student's status badge is still there");
  assert.ok(html.includes('id="chapter-c1"') && html.includes('id="chapter-c3"'), "each chapter keeps the anchor the Study Plan links to");
  // the empty state says what is true, whether or not the textbook is available
  assert.match(html, /No topics have been added for this chapter yet\.\s*Use the textbook and materials for this subject\./, "no textbook section: points to the subject's materials");
  assert.equal((html.match(/No topics have been added for this chapter yet\./g) ?? []).length, 2);
});

test("the textbook link appears only for a chapter with a verified section, opens the PDF at that page in a new tab, and is never offered otherwise", async () => {
  const html = renderToStaticMarkup(await (await SubjectPage())({ params: { subject: "maths" } }));
  assert.equal((html.match(/Open the textbook at page/g) ?? []).length, 2);
  assert.ok(hrefs(html).includes("https://blob.test/maths.pdf#page=11"));
  assert.ok(hrefs(html).includes("https://blob.test/maths.pdf#page=40"));
  assert.match(html, /<a[^>]*href="https:\/\/blob\.test\/maths\.pdf#page=11"[^>]*target="_blank"[^>]*rel="noopener noreferrer"/);
  assert.ok(!/page=\d+[^"]*"[^>]*>[^<]*Polynomials/.test(html));
});

test("English is unchanged: units with their lessons, each lesson a link to its topic page, no textbook link, no empty-state message", async () => {
  subject = {
    id: "eng",
    name: "English",
    classLabel: "Class 10",
    subjectMaterials: [],
    chapters: [
      { id: "u1", name: "Unit 1: Personality Development", topics: [topic("l1", "Attitude Is Altitude", "WEAK"), topic("l2", "Every Success Story Is also a Story of Great Failures"), topic("l3", "I Will Do It")], materials: [], textbook: null },
      { id: "u2", name: "Unit 2: Wit and Humour", topics: [topic("l4", "The Dear Departed - I"), topic("l5", "The Dear Departed - II"), topic("l6", "The Brave Potter")], materials: [], textbook: null },
    ],
  };
  const html = renderToStaticMarkup(await (await SubjectPage())({ params: { subject: "eng" } }));
  assert.deepEqual(hrefs(html).filter((h) => h.startsWith("/subjects/eng/")), ["l1", "l2", "l3", "l4", "l5", "l6"].map((x) => `/subjects/eng/${x}`));
  assert.equal((html.match(/3 topics/g) ?? []).length, 2);
  assert.ok(!html.includes("Open the textbook") && !html.includes("No topics"), "nothing is claimed that is not there");
  assert.ok(html.includes("Attitude Is Altitude") && html.includes("Needs work"));
  assert.ok(hrefs(html).some((h) => h.startsWith("/ai-tutor")), "the tutor link is still offered");
});

test("a subject with no chapters, and a subject that is not the student's, say so honestly", async () => {
  subject = { id: "x", name: "Telugu", classLabel: "Class 10", subjectMaterials: [], chapters: [] };
  assert.match(renderToStaticMarkup(await (await SubjectPage())({ params: { subject: "x" } })), /No chapters have been added for this subject yet\./);
  subject = null;
  await assert.rejects(async () => (await SubjectPage())({ params: { subject: "x" } }), NotFound);
});

test("the topic page names its subject and chapter, tells where the chapter starts in the textbook only when that is verified, and is honest about missing materials", async () => {
  topicData = { subjectId: "maths", subjectName: "Mathematics", chapterName: "Real Numbers", topic: { id: "t1", name: "Irrational Numbers", bloomLevel: "UNDERSTAND" }, status: null, mastery: null, materials: [], chapterTextbook: book };
  const html = renderToStaticMarkup(await (await TopicPage())({ params: { subject: "maths", topic: "t1" } }));
  assert.match(html, /Mathematics - Real Numbers/);
  assert.match(html, /This chapter starts on page 11 of/);
  assert.ok(hrefs(html).includes("https://blob.test/maths.pdf#page=11"));
  assert.match(html, /Your school has not shared any materials for this topic yet\./);
  assert.match(html, /No mastery recorded yet/);
  topicData = { ...topicData, chapterTextbook: null };
  const without = renderToStaticMarkup(await (await TopicPage())({ params: { subject: "maths", topic: "t1" } }));
  assert.ok(!without.includes("This chapter starts on page"));
  topicData = null;
  await assert.rejects(async () => (await TopicPage())({ params: { subject: "maths", topic: "zzz" } }), NotFound);
});
