// Offline tests for the Indian "today" and the day arithmetic (lib/calendar/day.ts): Today's Planner, the study plan and the next-exam countdown all take their
// day from here, so they cannot disagree. The instants used are fixed, so the results hold in whatever zone the machine running the tests is in.
import { test } from "node:test";
import assert from "node:assert/strict";

import { addDays, dayStart, daysBetween, localDateString, todayInIndia, todayWindow } from "@/lib/calendar/day";

test("todayInIndia flips at 18:30 UTC and follows month, year and leap-day boundaries", () => {
  assert.equal(todayInIndia(new Date("2026-10-16T18:29:59Z")), "2026-10-16");
  assert.equal(todayInIndia(new Date("2026-10-16T18:30:00Z")), "2026-10-17");
  assert.equal(todayInIndia(new Date("2026-10-31T19:00:00Z")), "2026-11-01");
  assert.equal(todayInIndia(new Date("2026-12-31T19:00:00Z")), "2027-01-01");
  assert.equal(todayInIndia(new Date("2028-02-28T19:00:00Z")), "2028-02-29");
  assert.equal(todayInIndia(new Date("2026-01-01T00:00:00Z")), "2026-01-01"); // 05:30 IST, same day
});

test("03:00 IST on 17 Oct is the 17th even though a UTC clock still says the 16th", () => {
  const at = new Date("2026-10-16T21:30:00Z");
  assert.equal(at.toISOString().slice(0, 10), "2026-10-16");
  assert.equal(todayInIndia(at), "2026-10-17");
});

test("todayWindow: start of today, start of tomorrow, and the rolling seven days ending today", () => {
  const w = todayWindow(new Date("2026-10-16T21:30:00Z"));
  assert.equal(w.today, "2026-10-17");
  assert.equal(localDateString(w.start), "2026-10-17");
  assert.equal(localDateString(w.end), "2026-10-18");
  assert.equal(localDateString(w.weekStart), "2026-10-11");
  assert.equal(w.start.getTime(), dayStart("2026-10-17").getTime());
  assert.ok(w.end.getTime() > w.start.getTime());
});

test("a task stored as the start of its day falls inside that day's window and no other", () => {
  const w = todayWindow(new Date("2026-10-16T21:30:00Z")); // the 17th
  const inside = dayStart("2026-10-17");
  assert.ok(inside >= w.start && inside < w.end);
  for (const other of ["2026-10-16", "2026-10-18"]) assert.ok(!(dayStart(other) >= w.start && dayStart(other) < w.end));
});

test("day arithmetic is whole days, across month and year ends and a leap day", () => {
  assert.equal(daysBetween("2026-10-17", "2026-10-20"), 3);
  assert.equal(daysBetween("2026-12-31", "2027-01-01"), 1);
  assert.equal(addDays("2028-02-28", 1), "2028-02-29");
  assert.equal(addDays("2026-03-01", -1), "2026-02-28");
});
