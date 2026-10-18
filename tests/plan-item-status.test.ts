// Offline tests for how a student's plan tasks are shown: done / missed / today / upcoming, the correct "next up", the time-zone-proof day, and the Study Plan page's and dashboard's use of
// them. The pure helpers are tested directly; the page is rendered to static markup with its server actions stubbed. No database, network or AI.
import { test, mock, before } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { taskState, planProgress, nextUpTask, formatDayKey } from "@/lib/study-plan/item-status";
import { addDays, todayInIndia, dayStart } from "@/lib/calendar/day";

const here = (p: string) => new URL(`../${p}`, import.meta.url).href;
(globalThis as unknown as { React: typeof React }).React = React;

const T = "2026-10-18";
const task = (dateKey: string, completed = false, title = `task ${dateKey}`) => ({ id: title, dateKey, completed, title });

// ---- the helpers -----------------------------------------------------------------------------------------------------------------------------------------------------------

test("a task is done, missed, today or upcoming: a finished task is always 'done', whatever day it was for", () => {
  assert.equal(taskState(task("2026-10-16", true), T), "done");
  assert.equal(taskState(task("2026-10-17"), T), "missed");
  assert.equal(taskState(task("2026-10-18"), T), "today");
  assert.equal(taskState(task("2026-10-19"), T), "upcoming");
});

test("the day before today is missed from the first moment of today, and today's task is not missed until tomorrow", () => {
  assert.equal(taskState(task(addDays(T, -1)), T), "missed");
  assert.equal(taskState(task(T), T), "today");
  assert.equal(taskState(task(T), addDays(T, 1)), "missed");
});

test("progress counts done, missed and still-ahead tasks (today counts as ahead)", () => {
  const items = [task("2026-10-16"), task("2026-10-17", true), task("2026-10-18"), task("2026-10-19"), task("2026-10-20", true)];
  assert.deepEqual(planProgress(items, T), { total: 5, done: 2, missed: 1, ahead: 2 });
  assert.deepEqual(planProgress([], T), { total: 0, done: 0, missed: 0, ahead: 0 });
});

test("'next up' is the first task still to do from today on - a missed task is never next, and a finished one is skipped", () => {
  const items = [task("2026-10-16", false, "old"), task("2026-10-17", true, "ticked"), task("2026-10-18", true, "today done"), task("2026-10-18", false, "today open"), task("2026-10-19", false, "later")];
  assert.equal(nextUpTask(items, T)?.title, "today open");
  assert.equal(nextUpTask([task("2026-10-16"), task("2026-10-17")], T), null, "only missed tasks: nothing is next");
  assert.equal(nextUpTask([], T), null);
});

test("a day is shown the same in every time zone", () => {
  const before = process.env.TZ;
  try {
    for (const tz of ["UTC", "Asia/Kolkata", "America/Los_Angeles", "Pacific/Kiritimati"]) {
      process.env.TZ = tz;
      assert.equal(formatDayKey("2026-10-16"), "Fri, Oct 16", tz);
    }
  } finally {
    if (before === undefined) delete process.env.TZ;
    else process.env.TZ = before;
  }
});

// ---- the Study Plan page ------------------------------------------------------------------------------------------------------------------------------------------------

mock.module("next/navigation", { namedExports: { useRouter: () => ({ push() {}, replace() {}, refresh() {}, back() {} }) } });
mock.module(here("lib/actions/analytics.ts"), { namedExports: { completeLearningPathItem: async () => ({ ok: true }), getMyLearningPath: async () => null, getMyWeakAreas: async () => [] } });
mock.module(here("components/dashboard/generate-learning-path-button.tsx"), { namedExports: { GenerateLearningPathButton: () => React.createElement("button", null, "Generate my learning path") } });

let View: typeof import("@/components/study-plan/real-learning-path-view").RealLearningPathView;
before(async () => {
  View = (await import("@/components/study-plan/real-learning-path-view")).RealLearningPathView;
});
const text = (h: string) => h.replace(/<[^>]+>/g, " ").replace(/&quot;/g, '"').replace(/\s+/g, " ").trim();
let n = 0;
const item = (dayOffset: number, completed: boolean, title: string) => {
  const dateKey = addDays(todayInIndia(), dayOffset);
  return { id: `i${++n}`, studyPlanId: "p", day: dayOffset + 10, date: dayStart(dateKey), dateKey, kind: "TOPIC", subject: "Mathematics", title, durationMinutes: 40, priority: "MEDIUM", completed };
};
const render = (items: ReturnType<typeof item>[]) =>
  renderToStaticMarkup(React.createElement(View, { learningPath: { id: "p", studentId: "s", createdAt: new Date(), items } as never, weakAreas: [], planNotes: [], subjectLinks: {} }));

test("the Study Plan page marks a not-done task of a past day as Missed, counts and explains it - and says nothing about done, today's or upcoming tasks", () => {
  const h = render([item(-2, false, "Study: Old chapter"), item(-1, true, "Study: Finished chapter"), item(0, false, "Study: Today chapter"), item(1, false, "Study: Later chapter")]);
  assert.equal((h.match(/>Missed</g) ?? []).length, 1, "exactly one Missed badge");
  const t = text(h);
  assert.match(t, /1 missed/);
  assert.match(t, /1 task was planned for days that have passed and is not done/);
  assert.match(t, /what you have already finished is kept/);
  const missedRow = h.slice(h.indexOf("Study: Old chapter"), h.indexOf("Study: Finished chapter"));
  assert.ok(missedRow.includes("Missed"));
  assert.ok(!h.slice(h.indexOf("Study: Finished chapter"), h.indexOf("Study: Today chapter")).includes("Missed"));
  assert.match(t, / - Today/, "today's day is labelled");
});

test("when every remaining task is done or in the past the page says there is nothing left and offers to plan the days ahead", () => {
  const h = render([item(-3, true, "Study: A"), item(-1, false, "Study: B")]);
  assert.match(text(h), /There is nothing left to do in this plan\. Press "Generate my learning path"/);
});

test("a plan with tasks still ahead and none missed shows neither message", () => {
  const h = render([item(0, false, "Study: A"), item(2, false, "Study: B")]);
  assert.ok(!/Missed|nothing left|days that have passed/.test(text(h)));
});

test("the day shown for a task comes from its day key, not from the browser's zone", () => {
  const before = process.env.TZ;
  try {
    process.env.TZ = "America/Los_Angeles"; // a viewer far from India
    const dateKey = "2026-10-16";
    const h = renderToStaticMarkup(React.createElement(View, { learningPath: { id: "p", studentId: "s", createdAt: new Date(), items: [{ id: "x", day: 1, date: new Date("2026-10-16T00:00:00Z"), dateKey, kind: "TOPIC", subject: "English", title: "Study: Unit 1", durationMinutes: 40, priority: "MEDIUM", completed: false }] } as never, weakAreas: [], planNotes: [], subjectLinks: {} }));
    assert.match(text(h), /Day 1 - Fri, Oct 16/);
  } finally {
    if (before === undefined) delete process.env.TZ;
    else process.env.TZ = before;
  }
});
