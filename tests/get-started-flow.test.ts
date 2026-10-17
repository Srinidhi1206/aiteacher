// Offline regression tests for the public "Get Started" flow and the authentication rules around it.
//   Public homepage -> Get Started -> Register / Sign in -> (after sign-in) the role's own home.
// Visitors are no longer made to answer State / Board / Class / Subjects before they can see the authentication screens, nothing generates a learning path
// before sign-in, and sign-in, role separation and the "signed-in users skip /login" rule are unchanged. The pages are rendered to static markup and the
// middleware is run against synthetic requests with a mocked session check - no database, network, sign-in provider or AI is involved.
// Needs Node's module mocking (switched on by --experimental-test-module-mocks in `npm run test:storage`).
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const here = (p: string) => new URL(`../${p}`, import.meta.url).href;
const source = (p: string) => fs.readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

// Some components use the automatic JSX runtime without importing React; the test runner compiles them with the classic one.
(globalThis as unknown as { React: typeof React }).React = React;

// ---- mocks: the router hooks, the session check, and the server-action modules the registration pages import ------------------------------------------
class RedirectSignal extends Error {
  constructor(public to: string) {
    super(`REDIRECT:${to}`);
  }
}
mock.module("next/navigation", {
  namedExports: {
    useRouter: () => ({ push() {}, replace() {}, refresh() {}, back() {} }),
    useSearchParams: () => new URLSearchParams(),
    redirect: (to: string) => {
      throw new RedirectSignal(to);
    },
  },
});
const SESSIONS: Record<string, { role: "student" | "teacher" | "admin" }> = { student: { role: "student" }, teacher: { role: "teacher" }, admin: { role: "admin" } };
mock.module(here("lib/auth/session.ts"), {
  namedExports: { SESSION_COOKIE: "maiteacher_session", verifySession: async (t?: string | null) => (t ? SESSIONS[t] ?? null : null) },
});
mock.module(here("lib/actions/curriculum.ts"), {
  namedExports: { listStates: async () => [], listBoards: async () => [], listSchoolClasses: async () => [], listSchools: async () => [], listSubjectsForClass: async () => [] },
});
mock.module(here("lib/actions/registration.ts"), { namedExports: { registerStudent: async () => ({ ok: false }), registerTeacher: async () => ({ ok: false }), requestAdminAccess: async () => ({ ok: false }) } });

const html = (el: React.ReactElement) => renderToStaticMarkup(el);
const text = (h: string) => h.replace(/<[^>]+>/g, " ").replace(/&#x27;|&apos;/g, "'").replace(/\s+/g, " ").trim();
const anchors = (h: string) => [...h.matchAll(/<a\b[^>]*\bhref="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g)].map((m) => ({ href: m[1], label: text(m[2]) }));

// ---- the public landing page ----------------------------------------------------------------------------------------------------------------------

test("Get Started, Start Learning Free and every pricing button open the Register screen directly; Sign in opens Login", async () => {
  const { default: LandingPage } = await import("@/app/(marketing)/page");
  const links = anchors(html(React.createElement(LandingPage)));
  const ctas = links.filter((l) => /^(get started|start learning free|coming soon)$/i.test(l.label));
  assert.ok(ctas.length >= 5, `expected the navbar (2), hero (1) and pricing (3) buttons, found ${ctas.length}`);
  for (const l of ctas) assert.equal(l.href, "/register", `"${l.label}" must go straight to Register`);
  const signIn = links.filter((l) => /^sign in$/i.test(l.label));
  assert.ok(signIn.length >= 1, "the navbar Sign in link");
  for (const l of signIn) assert.equal(l.href, "/login", "Sign in must open Login, never new-user setup");
  // The mobile menu is only drawn once opened, so it is checked in the source: both of its links use the same two destinations.
  const nav = source("components/marketing/navbar.tsx");
  assert.equal((nav.match(/href=\{SIGN_IN_HREF\}/g) ?? []).length, 2, "desktop and mobile Sign in");
  assert.equal((nav.match(/href=\{GET_STARTED_HREF\}/g) ?? []).length, 2, "desktop and mobile Get Started");
  assert.ok(!nav.includes("/onboarding"));
});

test("no link on the public landing page leads to the old State/Board/Class/Subjects questionnaire", async () => {
  const { default: LandingPage } = await import("@/app/(marketing)/page");
  const h = html(React.createElement(LandingPage));
  assert.ok(!/href="[^"]*onboarding/.test(h), "no /onboarding link");
  for (const l of anchors(h)) assert.ok(!l.href.includes("onboarding"));
});

test("the landing page keeps its navigation and sections (only the destinations changed)", async () => {
  const { default: LandingPage } = await import("@/app/(marketing)/page");
  const h = html(React.createElement(LandingPage));
  for (const id of ["#features", "#how-it-works", "#demo", "#pricing", "#faq"]) assert.ok(h.includes(`href="${id}"`), `${id} navigation link`);
  assert.match(text(h), /Personalized learning, powered by AI/);
});

// ---- the old questionnaire route --------------------------------------------------------------------------------------------------------------------

test("the old /onboarding route sends the visitor to Register immediately - nothing is asked first", async () => {
  const { default: OnboardingPage } = await import("@/app/onboarding/page");
  assert.throws(() => OnboardingPage(), (e: unknown) => e instanceof RedirectSignal && e.to === "/register");
});

test("the public pages cannot ask for State/Board/Class/Subjects or generate a learning path before sign-in", () => {
  for (const f of ["app/onboarding/page.tsx", "components/marketing/navbar.tsx", "components/marketing/hero.tsx", "components/marketing/pricing.tsx", "app/(marketing)/page.tsx"]) {
    const s = source(f);
    assert.ok(!/useCurriculumSelect|listSubjectsForClass|listStates|generateLearningPath|regenerateMyLearningPath|Build My Path|Building your personalized/.test(s), `${f} must not ask academic questions or build a plan`);
  }
  assert.ok(!/useState|useEffect|"use client"/.test(source("app/onboarding/page.tsx")), "the old route holds no interactive questionnaire any more");
});

// ---- Login and Register screens ---------------------------------------------------------------------------------------------------------------------

test("Login shows Student, Teacher and Admin straight away - no academic questions - and links to Register", async () => {
  const { default: LoginPage } = await import("@/app/login/page");
  const h = html(React.createElement(LoginPage));
  const t = text(h);
  for (const label of ["I'm a Student", "I'm a Teacher", "I'm an Admin"]) assert.ok(t.includes(label), label);
  assert.ok(!/State|Board|Select your|Subjects|learning path/i.test(t.replace(/Boards, classes/i, "")), "no academic setup on the sign-in screen");
  assert.ok(anchors(h).some((l) => l.href === "/register"), "a Register link for new users");
});

test("Register offers Student, Teacher and Admin-request, and a link back to Sign in", async () => {
  const { default: RegisterPage } = await import("@/app/register/page");
  const links = anchors(html(React.createElement(RegisterPage)));
  assert.deepEqual(links.filter((l) => l.href.startsWith("/register/")).map((l) => l.href).sort(), ["/register/admin", "/register/student", "/register/teacher"]);
  assert.ok(links.some((l) => l.href === "/login"), "Sign in link");
});

test("a new STUDENT is asked for State, Board and Class once - in student registration, where they are saved with the account", async () => {
  const { default: StudentRegistration } = await import("@/app/register/student/page");
  const t = text(html(React.createElement(StudentRegistration)));
  for (const label of ["State", "Board", "Class"]) assert.ok(t.includes(label), `${label} field`);
  assert.match(t, /Student registration/);
  assert.match(t, /reviewed by an administrator before you can sign in/);
  assert.ok(!/Build My Path|learning path/i.test(t), "no plan is built during registration");
});

test("Teacher and administrator registration are unchanged: each keeps its own role-specific form and neither builds a learning path", async () => {
  const { default: TeacherRegistration } = await import("@/app/register/teacher/page");
  const teacher = text(html(React.createElement(TeacherRegistration)));
  assert.match(teacher, /Teacher registration/);
  assert.match(teacher, /Subject/, "a teacher still states the classes and subjects they teach");
  const { default: AdminRegistration } = await import("@/app/register/admin/page");
  const admin = text(html(React.createElement(AdminRegistration)));
  assert.match(admin, /Why do you need administrator access\?/);
  assert.match(admin, /School name/);
  for (const f of ["app/register/teacher/page.tsx", "app/register/admin/page.tsx"]) assert.ok(!/generateLearningPath|Build My Path/.test(source(f)), f);
});

// ---- authentication and role authorization (the middleware) -------------------------------------------------------------------------------------------

const call = async (path: string, session?: "student" | "teacher" | "admin") => {
  const { middleware } = await import("@/middleware");
  const { NextRequest } = await import("next/server");
  const req = new NextRequest(`https://app.test${path}`, session ? { headers: { cookie: `maiteacher_session=${session}` } } : undefined);
  const res = await middleware(req);
  const location = res.headers.get("location");
  return { passes: res.headers.get("x-middleware-next") === "1", status: res.status, to: location ? new URL(location).pathname + new URL(location).search : null };
};

test("public pages stay public for visitors: /, /login, /register and its role pages, the old /onboarding redirect, the login API", async () => {
  for (const p of ["/", "/login", "/register", "/register/student", "/register/teacher", "/register/admin", "/onboarding", "/api/auth/login"]) {
    assert.equal((await call(p)).passes, true, `${p} is reachable without signing in`);
  }
});

test("existing users can sign in: a signed-out visitor reaches /login, and a signed-in user is sent to their own home instead of re-seeing it", async () => {
  assert.equal((await call("/login")).passes, true);
  assert.deepEqual((await call("/login", "student")).to, "/dashboard");
  assert.deepEqual((await call("/login", "teacher")).to, "/teacher");
  assert.deepEqual((await call("/login", "admin")).to, "/admin");
});

test("authentication is still enforced: every protected area sends a signed-out visitor to /login, remembering where they were going", async () => {
  for (const p of ["/dashboard", "/study-plan", "/calendar", "/teacher", "/admin", "/results"]) {
    const r = await call(p);
    assert.equal(r.passes, false, p);
    assert.equal(r.to, `/login?next=${encodeURIComponent(p)}`, p);
  }
});

test("role separation is unchanged: each role reaches its own area and is sent home from the others'", async () => {
  assert.equal((await call("/dashboard", "student")).passes, true);
  assert.equal((await call("/teacher", "teacher")).passes, true);
  assert.equal((await call("/admin", "admin")).passes, true);
  assert.equal((await call("/admin", "student")).to, "/dashboard");
  assert.equal((await call("/teacher", "student")).to, "/dashboard");
  assert.equal((await call("/dashboard", "teacher")).to, "/teacher");
  assert.equal((await call("/admin", "teacher")).to, "/teacher");
  assert.equal((await call("/dashboard", "admin")).to, "/admin");
  assert.equal((await call("/teacher", "admin")).to, "/admin");
});

test("an invalid or missing session never passes as a signed-in user", async () => {
  const { middleware } = await import("@/middleware");
  const { NextRequest } = await import("next/server");
  const res = await middleware(new NextRequest("https://app.test/admin", { headers: { cookie: "maiteacher_session=forged" } }));
  assert.equal(res.headers.get("x-middleware-next"), null);
  assert.match(res.headers.get("location") ?? "", /\/login\?next=%2Fadmin$/);
});

// ---- the destinations are defined once ---------------------------------------------------------------------------------------------------------------------

test("the landing destinations live in one place", async () => {
  const links = await import("@/lib/marketing/auth-links");
  assert.equal(links.GET_STARTED_HREF, "/register");
  assert.equal(links.SIGN_IN_HREF, "/login");
});
