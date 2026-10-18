// Offline tests for the dashboard's "Exams & Results" card: what its list holds (teacher-built ONLINE exams still to take - not the calendar's exam dates), what it says when it is empty (so it is
// not read as "no exam is coming" next to a Next exam card that shows one), and who can see an exam in it (own school and class, published only). The REAL listExamsForStudent runs against an
// in-memory database; nothing here touches a real database, network or AI. Needs Node's module mocking (--experimental-test-module-mocks, as in `npm run test:storage`).
import { test, mock, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { pendingOnlineExams, ONLINE_EXAMS_EMPTY, ONLINE_EXAMS_HEADING, ONLINE_EXAMS_LIMIT } from "@/lib/dashboard/online-exams";
import { matches } from "./fake-where";

const here = (p: string) => new URL(`../${p}`, import.meta.url).href;
(globalThis as unknown as { React: typeof React }).React = React;
type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

// ---- the in-memory database -----------------------------------------------------------------------------------------------------------------------------------------
class UnauthorizedError extends Error {}
class ForbiddenError extends Error {}
let session: { id: string; role: string } | null = null;
const students: Record<string, Row> = {
  asha: { id: "stuA", userId: "uA", schoolId: "demo", schoolClassId: "c10" },
  noSchool: { id: "stuN", userId: "uN", schoolId: null, schoolClassId: "c10" },
  noClass: { id: "stuC", userId: "uC", schoolId: "demo", schoolClassId: null },
  otherSchool: { id: "stuO", userId: "uO", schoolId: "other", schoolClassId: "c10" },
};
const subject = { id: "maths", name: "Mathematics" };
const exam = (id: string, over: Row = {}): Row => ({ id, title: `Online test ${id}`, status: "PUBLISHED", schoolClassId: "c10", subjectId: "maths", teacher: { schoolId: "demo" }, createdAt: new Date(`2026-10-1${id.length}`), ...over });
const exams: Row[] = [exam("e1"), exam("e2", { status: "DRAFT" }), exam("e3", { schoolClassId: "c9" }), exam("e4", { teacher: { schoolId: "other" } }), exam("e5")];
const submissions: Row[] = [{ id: "s1", examId: "e5", studentId: "stuA", status: "SUBMITTED" }, { id: "s2", examId: "e1", studentId: "stuB", status: "SUBMITTED" }];
const queries: unknown[] = [];
const prisma = {
  student: { findUnique: async ({ where }: { where: { userId: string } }) => Object.values(students).find((s) => s.userId === where.userId) ?? null },
  exam: {
    findMany: async (args: { where: unknown; include: { submissions: { where: { studentId: string } } } }) => {
      queries.push(args);
      return exams
        .filter((e) => matches(e, args.where))
        .map((e) => ({ ...e, subject, submissions: submissions.filter((s) => s.examId === e.id && matches(s, args.include.submissions.where)) }));
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
mock.module(here("lib/notifications/core.ts"), { namedExports: { notifyUserQuietly: async () => undefined, notifyQuietly: async () => undefined, audienceForClassInSchool: () => ({}) } });
mock.module(here("lib/audit.ts"), { namedExports: { logAudit: async () => undefined } });
mock.module(here("lib/academics/acting.ts"), { namedExports: { resolveAuthor: async () => null, canManageAuthored: async () => false, actingNote: () => "" } });
mock.module(here("lib/storage/index.ts"), { namedExports: { storage: {}, validateUploadFile: () => null, safeFilename: (n: string) => n, StorageNotConfiguredError: class extends Error {} } });
mock.module(here("lib/storage/errors.ts"), { namedExports: { isStorageBlocked: () => false } });
mock.module(here("lib/storage/stop-messages.ts"), { namedExports: { STORAGE_BLOCKED_MESSAGE: "blocked" } });
mock.module(here("lib/analytics/progress.ts"), { namedExports: { recalculateProgressForStudent: async () => undefined } });
mock.module(here("lib/analytics/weakness.ts"), { namedExports: { recalculateWeakAreas: async () => undefined } });
mock.module(here("lib/analytics/strengths.ts"), { namedExports: { recalculateStrengths: async () => undefined } });
mock.module(here("lib/ai/index.ts"), { namedExports: { getAIProvider: () => null, AIError: class extends Error { code = "x"; } } });

let actions: typeof import("@/lib/actions/exams");
let OnlineExamsList: typeof import("@/components/dashboard/online-exams-list").OnlineExamsList;
before(async () => {
  actions = await import("@/lib/actions/exams");
  OnlineExamsList = (await import("@/components/dashboard/online-exams-list")).OnlineExamsList;
});
const as = (userId: string) => void (session = { id: userId, role: "student" });
const text = (h: string) => h.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&#x27;/g, "'").replace(/\s+/g, " ").trim();

// ---- the list -----------------------------------------------------------------------------------------------------------------------------------------------------------------

test("only exams the student has no submission for are listed, in the order given, at most three", () => {
  const rows = [1, 2, 3, 4, 5].map((n) => ({ id: `x${n}`, submissions: n === 2 ? [{}] : [] }));
  assert.deepEqual(pendingOnlineExams(rows).map((r) => r.id), ["x1", "x3", "x4"]);
  assert.equal(ONLINE_EXAMS_LIMIT, 3);
  assert.deepEqual(pendingOnlineExams(rows, 10).map((r) => r.id), ["x1", "x3", "x4", "x5"]);
  assert.deepEqual(pendingOnlineExams([]), []);
  assert.equal(rows.length, 5, "the input is not changed");
});

test("with no online exam to take the card says so in words that cannot be read as 'no exam is coming', and points at where the calendar's exam dates are", () => {
  const h = renderToStaticMarkup(React.createElement(OnlineExamsList, { exams: [] }));
  const t = text(h);
  assert.ok(t.includes(ONLINE_EXAMS_HEADING));
  assert.ok(t.includes(ONLINE_EXAMS_EMPTY));
  assert.match(t, /No online exams to take right now/);
  assert.match(t, /school calendar/);
  assert.match(t, /Next exam/);
  assert.match(t, /Coming up/);
  assert.ok(!/No pending exams/.test(t), "the old, ambiguous wording is gone");
  assert.ok(!h.includes("/exams/"), "nothing to open");
});

test("each online exam to take links to its attempt page with its title and subject", () => {
  const h = renderToStaticMarkup(React.createElement(OnlineExamsList, { exams: [{ id: "e1", title: "Online test e1", subject: { name: "Mathematics" } }, { id: "e9", title: "Quiz", subject: { name: "English" } }] }));
  assert.match(h, /href="\/exams\/e1\/attempt"/);
  assert.match(h, /href="\/exams\/e9\/attempt"/);
  const t = text(h);
  assert.match(t, /Online test e1 Mathematics/);
  assert.match(t, /Quiz English/);
  assert.ok(!t.includes(ONLINE_EXAMS_EMPTY));
});

// ---- who sees which exam ------------------------------------------------------------------------------------------------------------------------------------------------

test("a student's list holds only PUBLISHED exams of their OWN school and class; the student's own submissions mark an exam as done", async () => {
  as("uA");
  queries.length = 0;
  const list = await actions.listExamsForStudent();
  assert.deepEqual(list.map((e: Row) => e.id).sort(), ["e1", "e5"], "not the draft (e2), the other class (e3) or the other school's (e4)");
  assert.deepEqual(pendingOnlineExams(list).map((e: Row) => e.id), ["e1"], "e5 was handed in by this student, so it is not 'to take'; another student's submission of e1 does not count");
  const where = (queries[0] as { where: Row }).where;
  assert.equal(where.status, "PUBLISHED");
  assert.equal(where.schoolClassId, "c10");
  assert.deepEqual(where.teacher, { schoolId: "demo" });
});

test("a student with no school or no class is shown nothing, and a student of another school sees only that school's exams; no query is made without a school and class", async () => {
  for (const u of ["uN", "uC"]) {
    as(u);
    queries.length = 0;
    assert.deepEqual(await actions.listExamsForStudent(), []);
    assert.equal(queries.length, 0, `${u}: no query is made`);
  }
  as("uO");
  assert.deepEqual((await actions.listExamsForStudent()).map((e: Row) => e.id), ["e4"]);
});

test("only a signed-in student can ask: nobody, or a teacher, is refused", async () => {
  session = null;
  await assert.rejects(() => actions.listExamsForStudent(), UnauthorizedError);
  session = { id: "t1", role: "teacher" };
  await assert.rejects(() => actions.listExamsForStudent(), ForbiddenError);
});

// ---- the dashboard keeps the two kinds of exam apart --------------------------------------------------------------------------------------------------------------------

test("the dashboard card reads the online exams only: its data comes from listExamsForStudent through pendingOnlineExams, and it does not read the calendar", () => {
  const src = fs.readFileSync(new URL("../components/dashboard/real-data-section.tsx", import.meta.url), "utf8");
  assert.match(src, /listExamsForStudent/);
  assert.match(src, /pendingOnlineExams\(exams\)/);
  assert.match(src, /<OnlineExamsList exams=\{upcomingExams\} \/>/);
  assert.ok(!/getMyCalendarEvents|getMyNextExam|listUpcomingExams|findNextExam/.test(src), "calendar exams stay in the Next exam card and the Coming up list");
  assert.ok(!/No pending exams/.test(src));
});
