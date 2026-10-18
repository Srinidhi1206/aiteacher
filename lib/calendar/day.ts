// "Today" and day arithmetic for the student-facing date features (the next-exam countdown, the study plan, Today's Planner).
//
// Students are in India, but the server runs on UTC, where "today" is still yesterday between 00:00 and 05:30 IST. So "today" is always the Indian
// calendar day (Asia/Kolkata, UTC+05:30, no daylight saving), whatever the server's own zone is. Everything else works on plain "yyyy-mm-dd" strings,
// so day counts never depend on a time zone.
//
// Storage convention (unchanged): a study-plan item or planner task is stored as the MIDNIGHT OF ITS DAY in the server's local zone (`dayStart`), and read
// back with local getters (`localDateString`); an academic event is a date-only value at UTC midnight, read with UTC getters (`utcDateString`).
export const APP_TIME_ZONE = "Asia/Kolkata";

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const IST_OFFSET_MS = (5 * 60 + 30) * 60_000;

const dayFormat = new Intl.DateTimeFormat("en-CA", { timeZone: APP_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" });

/** The Indian calendar date ("yyyy-mm-dd") of an instant. */
export function todayInIndia(now: Date = new Date()): string {
  const s = dayFormat.format(now);
  // en-CA gives yyyy-mm-dd; should a runtime ever format it differently, the fixed UTC+05:30 offset gives the same answer.
  return ISO_DAY.test(s) ? s : new Date(now.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

export function localDateString(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export function utcDateString(d: Date): string {
  return d.toISOString().slice(0, 10);
}
const toUtcMs = (s: string) => Date.UTC(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10)));
/** Whole days from `from` to `to` (negative when `to` is earlier). */
export function daysBetween(from: string, to: string): number {
  return Math.round((toUtcMs(to) - toUtcMs(from)) / 86_400_000);
}
export function addDays(date: string, n: number): string {
  return utcDateString(new Date(toUtcMs(date) + n * 86_400_000));
}
/** The instant an Indian calendar day begins (00:00 IST) - the lower bound for a query on timestamps (submissions, attempts) that belong to that day or later. */
export function indiaDayStartInstant(date: string): Date {
  return new Date(toUtcMs(date) - IST_OFFSET_MS);
}
/** A date string as the value stored for study-plan items and planner tasks: midnight of that day in the server's local zone. */
export function dayStart(date: string): Date {
  return new Date(`${date}T00:00:00`);
}

export interface TodayWindow {
  today: string;
  /** Start of today, and of tomorrow (end, exclusive), and of the day six days ago (a rolling 7-day week ending today). */
  start: Date;
  end: Date;
  weekStart: Date;
}
/** The one definition of "today" for Today's Planner, the planner statistics and the study plan, so they always agree. */
export function todayWindow(now: Date = new Date()): TodayWindow {
  const today = todayInIndia(now);
  return { today, start: dayStart(today), end: dayStart(addDays(today, 1)), weekStart: dayStart(addDays(today, -6)) };
}
