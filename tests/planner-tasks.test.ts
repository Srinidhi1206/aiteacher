// Offline tests for the student's own to-do list on the dashboard (lib/actions/planner.ts): what may be created, that only the owner can change or delete a task, that a made-up status
// is refused cleanly, and how the completion numbers are worked out. In-memory database; no network. Needs Node's module mocking (--experimental-test-module-mocks).
import { test, mock, before } from "node:test";
import assert from "node:assert/strict";

import { dayStart, todayInIndia } from "@/lib/calendar/day";

const here = (p: string) => new URL(`../${p}`, import.meta.url).href;
type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const D = { tasks: [] as Row[], seq: 0, students: { uA: { id: "A", userId: "uA" }, uB: { id: "B", userId: "uB" } } as Record<string, Row> };
const prisma = {
  student: { findUnique: async ({ where }: Row) => D.students[where.userId] ?? null },
  dailyPlannerTask: {
    create: async ({ data }: Row) => {
      const t = { id: `t${++D.seq}`, status: "TODO", ...data };
      D.tasks.push(t);
      return t;
    },
    findUnique: async ({ where }: Row) => D.tasks.find((t) => t.id === where.id) ?? null,
    update: async ({ where, data }: Row) => Object.assign(D.tasks.find((t) => t.id === where.id)!, data),
    delete: async ({ where }: Row) => void D.tasks.splice(D.tasks.findIndex((t) => t.id === where.id), 1),
    findMany: async ({ where }: Row) => D.tasks.filter((t) => t.studentId === where.studentId && t.date >= where.date.gte && t.date < where.date.lt),
  },
};
class UnauthorizedError extends Error {}
class ForbiddenError extends Error {}
let who: string | null = "uA";
mock.module("server-only", { namedExports: {} });
mock.module(here("lib/prisma.ts"), { namedExports: { prisma } });
mock.module(here("lib/auth/current-session.ts"), {
  namedExports: { UnauthorizedError, ForbiddenError, requireRole: async () => { if (!who) throw new UnauthorizedError("Sign in."); return { id: who, role: "student" }; } },
});
let planner: typeof import("@/lib/actions/planner");
before(async () => {
  planner = await import("@/lib/actions/planner");
});
const iso = (d: Date) => d.toISOString();
// A task is stored as the start of its day in the server's own zone (the convention in lib/calendar/day.ts), so today's tasks are dated that way whatever zone the server is in.
const todayNoon = () => dayStart(todayInIndia());

test("a student creates a task for themselves; the title is required and limited, the date must be a real date-time, the status starts as TODO", async () => {
  D.tasks.length = 0;
  who = "uA";
  const ok = await planner.createPlannerTask({ title: "  Revise sets ", subject: "Mathematics", date: iso(todayNoon()) });
  assert.equal(ok.ok, true);
  assert.deepEqual([D.tasks[0].title, D.tasks[0].studentId, D.tasks[0].status, D.tasks[0].priority], ["Revise sets", "A", "TODO", "MEDIUM"]);
  for (const bad of [{ title: "", date: iso(new Date()) }, { title: "x".repeat(201), date: iso(new Date()) }, { title: "ok", date: "tomorrow" }, { title: "ok" }, null]) {
    assert.equal((await planner.createPlannerTask(bad)).ok, false, JSON.stringify(bad)?.slice(0, 40));
  }
  assert.equal(D.tasks.length, 1);
});

test("a task can be ticked, un-ticked or skipped only by its owner; another student gets 'not found' and nothing changes", async () => {
  D.tasks.length = 0;
  who = "uA";
  const id = (await planner.createPlannerTask({ title: "Read poem", date: iso(todayNoon()) })).data!.id;
  assert.equal((await planner.setPlannerTaskStatus(id, "COMPLETED")).ok, true);
  assert.equal(D.tasks[0].status, "COMPLETED");
  assert.equal((await planner.setPlannerTaskStatus(id, "TODO")).ok, true);
  who = "uB";
  assert.deepEqual(await planner.setPlannerTaskStatus(id, "COMPLETED"), { ok: false, error: "Task not found." });
  assert.deepEqual(await planner.deletePlannerTask(id), { ok: false, error: "Task not found." });
  assert.equal(D.tasks[0].status, "TODO");
  assert.equal(D.tasks.length, 1);
  who = "uA";
  assert.deepEqual(await planner.deletePlannerTask(id), { ok: true });
  assert.equal(D.tasks.length, 0);
});

test("a made-up status from the browser is refused with a plain message, before the database is asked", async () => {
  D.tasks.length = 0;
  who = "uA";
  const id = (await planner.createPlannerTask({ title: "Read poem", date: iso(todayNoon()) })).data!.id;
  assert.deepEqual(await planner.setPlannerTaskStatus(id, "DONE-AND-DUSTED" as never), { ok: false, error: "That is not a valid status." });
  assert.equal(D.tasks[0].status, "TODO");
});

test("signed out, every task action is refused", async () => {
  who = null;
  assert.equal((await planner.createPlannerTask({ title: "x", date: iso(new Date()) })).ok, false);
  assert.equal((await planner.setPlannerTaskStatus("t1", "COMPLETED")).ok, false);
  assert.equal((await planner.deletePlannerTask("t1")).ok, false);
  who = "uA";
});

test("completion numbers: completed over all of today's tasks, skipped counted separately, remaining = the rest, and null (not 0%) when there are no tasks", async () => {
  D.tasks.length = 0;
  who = "uA";
  assert.deepEqual((await planner.getPlannerAnalytics()).today, { total: 0, completed: 0, skipped: 0, remaining: 0, completionPct: null });
  for (const status of ["COMPLETED", "COMPLETED", "SKIPPED", "TODO", "IN_PROGRESS"]) {
    const id = (await planner.createPlannerTask({ title: `task ${status}`, date: iso(todayNoon()) })).data!.id;
    await planner.setPlannerTaskStatus(id, status as never);
  }
  const mine = (await planner.getPlannerAnalytics()).today;
  assert.deepEqual(mine, { total: 5, completed: 2, skipped: 1, remaining: 2, completionPct: 40 });
  who = "uB";
  assert.equal((await planner.getPlannerAnalytics()).today.total, 0, "another student's tasks are not counted");
  who = "uA";
});
