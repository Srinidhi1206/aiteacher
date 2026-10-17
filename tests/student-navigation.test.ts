// Offline tests for student navigation and sign-in routing (journey G) and for the links that lead into the AI Tutor (journeys A and B): every sidebar page is protected for the
// right role, every link into the tutor uses only what the tutor page understands, and the subject and topic pages offer the tutor with the right context.
// The middleware runs on synthetic requests with a mocked session check; the pages are rendered to static HTML with their data stubbed. No database, network or AI.
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const here = (p: string) => new URL(`../${p}`, import.meta.url).href;
const root = new URL("../", import.meta.url);
const read = (p: string) => fs.readFileSync(new URL(p, root), "utf8");
(globalThis as unknown as { React: typeof React }).React = React;

class NotFound extends Error {}
mock.module("next/navigation", {
  namedExports: {
    useRouter: () => ({ push() {}, replace() {}, refresh() {}, back() {} }),
    useSearchParams: () => new URLSearchParams(),
    usePathname: () => "/",
    notFound: () => {
      throw new NotFound();
    },
  },
});
const SESSIONS: Record<string, { role: "student" | "teacher" | "admin" }> = { student: { role: "student" }, teacher: { role: "teacher" }, admin: { role: "admin" } };
mock.module(here("lib/auth/session.ts"), { namedExports: { SESSION_COOKIE: "maiteacher_session", verifySession: async (t?: string | null) => (t ? SESSIONS[t] ?? null : null) } });
mock.module(here("components/layout/topbar.tsx"), { namedExports: { Topbar: ({ title }: { title: string }) => React.createElement("h1", null, title) } });

type Who = "student" | "teacher" | "admin";
const call = async (p: string, who?: Who) => {
  const { middleware } = await import("@/middleware");
  const { NextRequest } = await import("next/server");
  const res = await middleware(new NextRequest(`https://app.test${p}`, who ? { headers: { cookie: `maiteacher_session=${who}` } } : undefined));
  const location = res.headers.get("location");
  return { passes: res.headers.get("x-middleware-next") === "1", to: location ? new URL(location).pathname + new URL(location).search : null };
};
const HOME: Record<Who, string> = { student: "/dashboard", teacher: "/teacher", admin: "/admin" };

// ---- G. navigation and role routing ---------------------------------------------------------------------------------------------------------------------------------------

test("every page in the student sidebar sends a signed-out visitor to /login (remembering the page) and opens for a student", async () => {
  const { navForRole } = await import("@/lib/nav");
  const items = navForRole("student");
  assert.ok(items.length >= 15);
  for (const item of items) {
    const out = await call(item.href);
    assert.equal(out.passes, false, `${item.href} must not open for a signed-out visitor`);
    assert.equal(out.to, `/login?next=${encodeURIComponent(item.href)}`, item.href);
    assert.equal((await call(item.href, "student")).passes, true, `${item.href} must open for a student`);
  }
});

test("a teacher or an administrator who opens a student page is sent to their own home - for EVERY page in the student sidebar (/timetable used to be missed)", async () => {
  const { navForRole } = await import("@/lib/nav");
  for (const item of navForRole("student")) {
    for (const who of ["teacher", "admin"] as const) {
      const out = await call(item.href, who);
      assert.deepEqual([item.href, out.passes, out.to], [item.href, false, HOME[who]], `${who} on ${item.href}`);
    }
  }
});

test("the teacher and admin sidebars open for their own role and are closed to a student", async () => {
  const { navForRole } = await import("@/lib/nav");
  for (const who of ["teacher", "admin"] as const) {
    for (const item of navForRole(who)) {
      assert.equal((await call(item.href, who)).passes, true, `${who} on ${item.href}`);
      assert.equal((await call(item.href, "student")).to, HOME.student, `a student on ${item.href}`);
    }
  }
});

test("the AI tutor and its deep links (topic + prefilled question) are student-only and survive sign-in", async () => {
  const link = "/ai-tutor?topicId=abc&prefill=Hello";
  assert.equal((await call("/ai-tutor", "student")).passes, true);
  assert.equal((await call("/ai-tutor", "teacher")).to, "/teacher");
  assert.equal((await call("/ai-tutor")).to, "/login?next=%2Fai-tutor", "signed out: sent to sign in");
  assert.equal((await call(link, "student")).passes, true);
});

test("an unknown token never counts as signed in", async () => {
  const { middleware } = await import("@/middleware");
  const { NextRequest } = await import("next/server");
  const res = await middleware(new NextRequest("https://app.test/dashboard", { headers: { cookie: "maiteacher_session=garbage" } }));
  assert.equal(res.headers.get("x-middleware-next"), null);
  assert.match(res.headers.get("location") ?? "", /\/login\?next=%2Fdashboard$/);
});

// ---- A / B. every way into the AI tutor ----------------------------------------------------------------------------------------------------------------------------------

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(new URL(dir + "/", root), { withFileTypes: true })) {
    const p = `${dir}/${e.name}`;
    if (e.isDirectory()) sourceFiles(p, out);
    else if (/\.(ts|tsx)$/.test(e.name)) out.push(p);
  }
  return out;
}

test("every link into /ai-tutor in the code uses only the two things the tutor page understands (topicId, prefill)", () => {
  const files = [...sourceFiles("app"), ...sourceFiles("components"), ...sourceFiles("lib")];
  let found = 0;
  for (const f of files) {
    for (const m of read(f).matchAll(/\/ai-tutor\?([^`"'\s]*)/g)) {
      found++;
      const keys = [...m[1].matchAll(/(?:^|&)([A-Za-z]+)=/g)].map((k) => k[1]);
      assert.ok(keys.length > 0 && keys.every((k) => k === "topicId" || k === "prefill"), `${f}: ${m[0]}`);
    }
  }
  assert.ok(found >= 6, `expected the dashboard, plan, weak-area, strength, subject and topic links, found ${found}`);
  const page = read("app/(app)/ai-tutor/page.tsx");
  assert.match(page, /searchParams\.topicId/);
  assert.match(page, /searchParams\.prefill/);
});

const subjectData = { id: "s1", name: "Mathematics", classLabel: "Class 10", subjectMaterials: [], chapters: [{ id: "c1", name: "Real Numbers", topics: [{ id: "t1", name: "Euclid's division lemma", bloomLevel: "UNDERSTAND", status: null, mastery: null }], materials: [] }] };
const topicData = { subjectId: "s1", subjectName: "Mathematics", chapterName: "Real Numbers", topic: { id: "t1", name: "Euclid's division lemma", bloomLevel: "UNDERSTAND" }, status: null, mastery: null, materials: [] };
let curriculum: { getMySubject: () => Promise<unknown>; getMyTopic: () => Promise<unknown> } = { getMySubject: async () => subjectData, getMyTopic: async () => topicData };
mock.module(here("lib/actions/student-curriculum.ts"), { namedExports: { getMySubject: () => curriculum.getMySubject(), getMyTopic: () => curriculum.getMyTopic(), getMySubjects: async () => ({ subjects: [] }) } });
mock.module(here("lib/actions/practice.ts"), { namedExports: { startPractice: async () => ({ ok: false }) } });
const hrefs = (html: string) => [...html.matchAll(/<a\b[^>]*\bhref="([^"]*)"/g)].map((m) => m[1].replace(/&amp;/g, "&").replace(/&#x27;/g, "'"));

test("A: the subject page offers the AI tutor, with the subject (and class) in the question", async () => {
  const Page = (await import("@/app/(app)/subjects/[subject]/page")).default;
  const html = renderToStaticMarkup(await Page({ params: { subject: "s1" } }));
  const tutor = hrefs(html).find((h) => h.startsWith("/ai-tutor"));
  assert.ok(tutor, "there is a link to the tutor");
  assert.equal(new URL(tutor!, "https://x.test").searchParams.get("prefill"), "Help me with Mathematics (Class 10).");
  assert.match(html, /Ask the AI Tutor about Mathematics/);
  assert.ok(hrefs(html).includes("/subjects/s1/t1"), "and the topic links are still there");
});

test("A/B: the topic page offers the tutor for THIS topic: topicId (so the tutor opens with the subject, chapter and the student's mastery) plus the question", async () => {
  const Page = (await import("@/app/(app)/subjects/[subject]/[topic]/page")).default;
  const html = renderToStaticMarkup(await Page({ params: { subject: "s1", topic: "t1" } }));
  const tutor = hrefs(html).find((h) => h.startsWith("/ai-tutor"));
  assert.ok(tutor);
  const url = new URL(tutor!, "https://x.test");
  assert.equal(url.searchParams.get("topicId"), "t1");
  assert.equal(url.searchParams.get("prefill"), 'Explain "Euclid\'s division lemma" (Mathematics, Real Numbers) to me.');
  assert.match(html, /Ask the AI Tutor about this topic/);
  assert.ok(html.includes("Practice this topic"), "practice is still offered");
});

test("a subject or topic that is not the student's own is a 404 - no tutor link, no content", async () => {
  curriculum = { getMySubject: async () => null, getMyTopic: async () => null };
  try {
    const SubjectPage = (await import("@/app/(app)/subjects/[subject]/page")).default;
    const TopicPage = (await import("@/app/(app)/subjects/[subject]/[topic]/page")).default;
    await assert.rejects(() => SubjectPage({ params: { subject: "x" } }), NotFound);
    await assert.rejects(() => TopicPage({ params: { subject: "x", topic: "y" } }), NotFound);
  } finally {
    curriculum = { getMySubject: async () => subjectData, getMyTopic: async () => topicData };
  }
});

test("the study-plan and dashboard tasks link into the tutor with the task text, and into the subject page", () => {
  const plan = read("components/study-plan/real-learning-path-view.tsx");
  assert.match(plan, /\/ai-tutor\?prefill=/);
  assert.match(plan, /\/subjects\/\$\{subjectLinks\[item\.subject\]\}/);
});
