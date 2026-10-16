// "What is my next exam?" - the dated exams a student can see, whichever of the two exam sources they come from:
//   - the administrator's academic calendar (AcademicEvent of type EXAM, e.g. "Half-Yearly Examination Begins" / "... Ends"), and
//   - the older per-subject exam schedules (ExamSchedule).
// Both are filtered by the SAME rules the student Calendar uses (lib/calendar/scope.ts): published only, and only for the student's own
// school, board and class. Drafts and other audiences never reach this code.
//
// Dates: "today" is the Indian calendar day (lib/calendar/day.ts - the server runs on UTC, where it would still be yesterday until 05:30 IST); an academic
// event is a date-only value stored at UTC midnight; an exam schedule's date is read the way the student Calendar reads it. Everything past the database
// query works on plain "yyyy-mm-dd" strings, so day counts never depend on a time zone.
import type { prisma } from "@/lib/prisma";
import { studentAcademicEventWhere, studentExamScheduleWhere, type StudentCalendarScope } from "@/lib/calendar/scope";
import { addDays, daysBetween, localDateString, todayInIndia, utcDateString } from "@/lib/calendar/day";

export { addDays, daysBetween, localDateString, todayInIndia, utcDateString };
export type ExamDb = Pick<typeof prisma, "academicEvent" | "examSchedule">;

/** One paper of an exam: the subject, and the chapters it covers as the administrator wrote them (for example "Chapters 1-4"). */
export interface ExamPaper {
  subjectName: string;
  chapterScope: string | null;
}
export interface ExamItem {
  id: string;
  /** The title as the administrator wrote it, for example "Half-Yearly Examination Begins". */
  title: string;
  /** The same without the begin/end word, for example "Half-Yearly Examination" - what is shown and what Begins/Ends rows are matched on. */
  label: string;
  startDate: string;
  /** Last day when the exam spans several days, otherwise null. */
  endDate: string | null;
  source: "calendar" | "schedule";
  /** The subjects (and chapters) the exam is known to cover, from the older exam schedules. Empty = the calendar does not say. */
  papers: ExamPaper[];
}

const BOUNDARY_WORD = /\b(begins?|starts?|commences?|ends?|ending|concludes?|finish(?:es)?)\b/gi;
const END_WORD = /\b(ends?|ending|concludes?|finish(?:es)?)\b/i;

export function examLabel(title: string): string {
  return title.replace(BOUNDARY_WORD, " ").replace(/\s+/g, " ").replace(/^[\s\-–:()]+|[\s\-–:()]+$/g, "").trim() || title.trim();
}
const norm = (s: string) => examLabel(s).toLowerCase();
export function isExamEnd(title: string): boolean {
  return END_WORD.test(title);
}

export interface RawCalendarExam {
  id: string;
  title: string;
  startDate: string;
  endDate: string | null;
}
export interface RawScheduleExam {
  id: string;
  name: string;
  examDate: string;
  subjectName: string;
  chapterScope: string;
}

// An exam never runs longer than this; a "Begins" row is not stretched to an "Ends" row further away than this.
export const MAX_EXAM_SPAN_DAYS = 31;

const tokens = (s: string) => norm(s).replace(/[^\p{L}\p{N}]+/gu, " ").trim().split(" ").filter(Boolean);
/** Two exam names that plausibly name the same exam: equal, or every word of the shorter one is in the longer ("Unit Test 2" / "Mathematics Unit Test 2"). */
function relatedNames(a: string, b: string): boolean {
  const [x, y] = [tokens(a), tokens(b)];
  if (x.length === 0 || y.length === 0) return false;
  const [small, big] = x.length <= y.length ? [x, y] : [y, x];
  return small.every((t) => big.includes(t));
}

/**
 * Turns the raw rows into exams.
 *   - A calendar "X Ends" row is not a new exam: it closes the earlier "X Begins" row of the same name. It never closes a "Begins" row across the NEXT
 *     "Begins" of the same name (that "Ends" belongs to the later exam), and never more than MAX_EXAM_SPAN_DAYS later. An "Ends" row with no "Begins" is left out.
 *   - The same exam written twice for the same day counts once.
 *   - The older exam schedules (one row per subject paper) are attached to the calendar exam they belong to - the same exam by name, with the paper's date inside the
 *     calendar exam's dates - so the exam keeps the calendar's date range AND gains the schedule's subjects and chapters. A schedule that does not belong to a calendar exam
 *     is an exam of its own. Exams are never merged just because their dates match.
 */
export function buildExamItems(calendar: RawCalendarExam[], schedules: RawScheduleExam[] = []): ExamItem[] {
  const sorted = [...calendar].sort((a, b) => a.startDate.localeCompare(b.startDate) || a.title.localeCompare(b.title));
  const starts = sorted.filter((e) => !isExamEnd(e.title));
  const ends = sorted.filter((e) => isExamEnd(e.title));
  const used = new Set<string>();
  const seen = new Set<string>();
  const items: ExamItem[] = [];
  for (const e of starts) {
    const key = `${norm(e.title)}#${e.startDate}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const nextSameName = starts.find((x) => norm(x.title) === norm(e.title) && x.startDate > e.startDate)?.startDate;
    const close = ends.find(
      (x) => !used.has(x.id) && norm(x.title) === norm(e.title) && x.startDate >= e.startDate && (!nextSameName || x.startDate < nextSameName) && daysBetween(e.startDate, x.startDate) <= MAX_EXAM_SPAN_DAYS
    );
    if (close) used.add(close.id);
    const last = close?.startDate ?? e.endDate;
    items.push({ id: e.id, title: e.title, label: examLabel(e.title), startDate: e.startDate, endDate: last && last > e.startDate ? last : null, source: "calendar", papers: [] });
  }
  const own = new Set<string>();
  for (const s of schedules) {
    const paper: ExamPaper = { subjectName: s.subjectName, chapterScope: s.chapterScope.trim() || null };
    const host = items.find((c) => c.source === "calendar" && relatedNames(c.label, s.name) && s.examDate >= c.startDate && s.examDate <= (c.endDate ?? c.startDate));
    if (host) {
      if (!host.papers.some((p) => norm(p.subjectName) === norm(paper.subjectName))) host.papers.push(paper);
      continue;
    }
    const key = `${norm(s.name)}#${s.examDate}#${norm(s.subjectName)}`;
    if (own.has(key)) continue;
    own.add(key);
    items.push({ id: s.id, title: s.name, label: s.name.trim(), startDate: s.examDate, endDate: null, source: "schedule", papers: [paper] });
  }
  return items.sort((a, b) => a.startDate.localeCompare(b.startDate) || a.label.localeCompare(b.label));
}

export interface NextExam extends ExamItem {
  /** Days from today to the first day (0 = today, negative when it has already started and is still running). */
  daysUntil: number;
  status: "upcoming" | "today" | "ongoing";
}

/** The nearest exam that has not finished: today's and a still-running one count, a finished one never does. */
export function pickNextExam(items: ExamItem[], today: string): NextExam | null {
  const open = items.filter((e) => (e.endDate ?? e.startDate) >= today).sort((a, b) => a.startDate.localeCompare(b.startDate) || a.label.localeCompare(b.label));
  const e = open[0];
  if (!e) return null;
  const days = daysBetween(today, e.startDate);
  return { ...e, daysUntil: days, status: days > 0 ? "upcoming" : days === 0 ? "today" : "ongoing" };
}

export function describeDaysUntil(days: number, ongoing = false): string {
  if (ongoing) return "Under way now";
  if (days < 0) return days === -1 ? "Yesterday" : `${-days} days ago`;
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  return `In ${days} days`;
}

// How far back a "Begins" row may be and still be matched to an "Ends" row that has not happened yet (an exam that is under way today).
const LOOKBACK_DAYS = 45;
const MAX_ROWS = 300;

/**
 * Every exam this student can see that has not finished, from both sources, nearest first. The database is only asked for rows in the student's scope.
 * A failed query is NOT turned into an empty list: it throws, so a caller can tell "could not look" from "there are none" (the dashboard says so, and plan
 * generation stops without touching the existing plan).
 */
export async function listUpcomingExams(db: ExamDb, student: StudentCalendarScope, today: string): Promise<ExamItem[]> {
  const academicWhere = studentAcademicEventWhere(student);
  const scheduleWhere = studentExamScheduleWhere(student);
  const since = addDays(today, -LOOKBACK_DAYS);
  const [calendarRows, scheduleRows] = await Promise.all([
    academicWhere
      ? db.academicEvent
          .findMany({ where: { AND: [academicWhere, { type: "EXAM" }, { startDate: { gte: new Date(`${since}T00:00:00.000Z`) } }] }, select: { id: true, title: true, startDate: true, endDate: true }, orderBy: { startDate: "asc" }, take: MAX_ROWS })
      : Promise.resolve([]),
    scheduleWhere
      ? db.examSchedule.findMany({ where: { AND: [scheduleWhere, { examDate: { gte: new Date(`${addDays(today, -1)}T00:00:00`) } }] }, select: { id: true, name: true, examDate: true, subjectName: true, chapterScope: true }, orderBy: { examDate: "asc" }, take: MAX_ROWS })
      : Promise.resolve([]),
  ]);
  const items = buildExamItems(
    calendarRows.map((r) => ({ id: r.id, title: r.title, startDate: utcDateString(r.startDate), endDate: r.endDate ? utcDateString(r.endDate) : null })),
    scheduleRows.map((r) => ({ id: r.id, name: r.name, examDate: localDateString(r.examDate), subjectName: r.subjectName, chapterScope: r.chapterScope }))
  );
  return items.filter((e) => (e.endDate ?? e.startDate) >= today);
}

export async function findNextExam(db: ExamDb, student: StudentCalendarScope, today: string): Promise<NextExam | null> {
  return pickNextExam(await listUpcomingExams(db, student, today), today);
}

/** The same, for "now": today is the Indian calendar day of that instant. */
export async function findNextExamAt(db: ExamDb, student: StudentCalendarScope, now: Date): Promise<NextExam | null> {
  return findNextExam(db, student, todayInIndia(now));
}
