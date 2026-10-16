// Offline tests for the dashboard's Next-exam card (components/dashboard/next-exam-view.tsx), rendered to static markup: what a student reads for a far
// exam, today, tomorrow, a running exam, no exam and a failed lookup. No database or network is involved.
import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { NextExamView } from "@/components/dashboard/next-exam-view";
import type { NextExam } from "@/lib/calendar/next-exam";

const exam = (over: Partial<NextExam>): NextExam => ({ id: "x", title: "Pre-Final Examination Begins", label: "Pre-Final Examination", startDate: "2026-12-12", endDate: null, source: "calendar", papers: [], daysUntil: 57, status: "upcoming", ...over });
const html = (e: NextExam | null, failed = false) => renderToStaticMarkup(React.createElement(NextExamView, { exam: e, failed }));
const text = (h: string) => h.replace(/<[^>]+>/g, " ").replace(/&#x27;|&apos;/g, "'").replace(/\s+/g, " ");

test("a far-away exam shows its name, its date and the days left", () => {
  const t = text(html(exam({})));
  assert.match(t, /Next exam/);
  assert.match(t, /Pre-Final Examination/);
  assert.match(t, /Sat, Dec 12, 2026/);
  assert.match(t, /In 57 days/);
});

test("today, tomorrow and a running exam have their own wording", () => {
  assert.match(text(html(exam({ daysUntil: 0, status: "today", startDate: "2026-10-16" }))), /Today/);
  assert.match(text(html(exam({ daysUntil: 1, startDate: "2026-10-17" }))), /Tomorrow/);
  const running = text(html(exam({ daysUntil: -1, status: "ongoing", startDate: "2026-10-15", endDate: "2026-10-17" })));
  assert.match(running, /Under way now/);
  assert.match(running, /Oct 15, 2026 to .*Oct 17, 2026/);
});

test("a multi-day exam shows its first and last day; a subject is shown when the exam names one", () => {
  const t = text(html(exam({ endDate: "2026-12-18", papers: [{ subjectName: "Mathematics", chapterScope: null }] })));
  assert.match(t, /Dec 12, 2026 to .*Dec 18, 2026 - Mathematics/);
});

test("no upcoming exam: a calm message, no badge", () => {
  const h = html(null);
  assert.match(text(h), /No upcoming exam is on your calendar yet/);
  assert.ok(!h.includes("next-exam-badge"));
});

test("a failed lookup says so quietly instead of showing a wrong 'no exam'", () => {
  const t = text(html(null, true));
  assert.match(t, /couldn't be loaded right now/);
  assert.ok(!/No upcoming exam/.test(t));
});

test("it links to the study plan", () => {
  assert.match(html(exam({})), /href="\/study-plan"/);
});
