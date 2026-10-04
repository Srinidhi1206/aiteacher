// Reading a timetable out of the TEXT of a document (a PDF's text layer, or text an OCR step produced) when it is laid out
// as a list:
//     Class 10-A
//     Monday
//     09:00-10:00 -> Mathematics (Mr. Rao) Room 12
//     10:00-11:00 -> English
//     Tuesday
//     P1 Science
// A class heading starts a new class (so a document with several classes is separated), a day heading sets the day, a line with
// a time range is a period, "P3 Science" / "Period 3: Science" is a period with no clock time. Timetables drawn as a grid
// (days as columns) rarely survive as text this way, which is why the importer falls back to the AI reader for those. The
// parser only reports what the text says: no day, time, subject, teacher or room is ever assumed.
import { dayHeading, findTimeRange, parseClassHeading } from "@/lib/timetable/parts";
import type { ExtractedTimetable, RawGroup, RawPeriod } from "@/lib/timetable/types";

const SEPARATORS = /^[\s\-–—:;,.>|→•*]+|[\s\-–—:;,.>|→•*]+$/g;
const TEACHER_PAREN = /\(\s*((?:mr|mrs|ms|miss|dr|sir|madam|smt|shri)\b\.?[^)]{1,60})\)/i;
const TEACHER_LABEL = /\b(?:teacher|faculty|tr\.?)\s*[:\-]\s*([A-Za-z.][A-Za-z. ]{1,40})/i;
const ROOM = /\b(?:room|rm\.?|r\.?\s?no\.?)\s*[:.\-]?\s*([A-Za-z0-9][A-Za-z0-9-]{0,8})\b/i;

function clean(s: string): string {
  return s.replace(SEPARATORS, "").replace(/\s+/g, " ").trim();
}

/** Splits "Mathematics (Mr. Rao) Room 12" into subject / teacher / room, taking out only what is explicitly marked. */
export function splitSubjectLine(rest: string): { subject: string; teacher: string | null; room: string | null } {
  let text = rest;
  let teacher: string | null = null;
  let room: string | null = null;
  const tp = text.match(TEACHER_PAREN);
  if (tp) {
    teacher = clean(tp[1]);
    text = text.replace(tp[0], " ");
  } else {
    const tl = text.match(TEACHER_LABEL);
    if (tl) {
      teacher = clean(tl[1]);
      text = text.replace(tl[0], " ");
    }
  }
  const rm = text.match(ROOM);
  if (rm) {
    room = rm[1];
    text = text.replace(rm[0], " ");
  }
  return { subject: clean(text).slice(0, 100), teacher: teacher || null, room };
}

const PERIOD_LEAD = /^\s*(?:p|period|pd\.?)\s*[-.#:]?\s*(\d{1,2})\b\s*[:.\-–—→)]*\s*/i;
const NUMBER_LEAD = /^\s*(\d{1,2})\s*[.)]\s+(?=\S)/;

function period(day: number | null, num: number | null, range: { start: string; end: string; warnings: string[] } | null, rest: string, source: string): RawPeriod | null {
  const { subject, teacher, room } = splitSubjectLine(rest);
  if (!/[A-Za-z]{2}/.test(subject)) return null;
  const warnings = [...(range?.warnings ?? [])];
  if (day === null) warnings.push("No day was found above this period - choose the day");
  return { origin: "text", day, period: num, startTime: range?.start ?? null, endTime: range?.end ?? null, subject, teacher, room, sourceText: source.trim().slice(0, 300), warnings };
}

export function parseTimetableText(text: string): ExtractedTimetable {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.replace(/[\t|]+/g, " ").replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const groups: RawGroup[] = [];
  let current: RawGroup | null = null;
  let day: number | null = null;
  const ensureGroup = () => {
    if (!current) {
      current = { className: "", section: "", periods: [] };
      groups.push(current);
    }
    return current;
  };

  for (const line of lines) {
    // A class heading starts a new class - this is what separates several classes in one document.
    const heading = parseClassHeading(line);
    if (heading && !findTimeRange(line)) {
      current = { className: line.replace(/^time\s*table\s*[:\-–—]?\s*/i, "").trim(), section: heading.section, periods: [] };
      groups.push(current);
      day = null;
      continue;
    }
    const d = dayHeading(line);
    if (d !== null) {
      day = d;
      continue;
    }

    const range = findTimeRange(line);
    if (range) {
      const before = line.slice(0, range.index);
      const after = line.slice(range.endIndex);
      // "P1 09:00-09:45 Maths" / "09:00-09:45 P1 Maths" / "1. 09:00-09:45 Maths"
      let num: number | null = null;
      const lead = (before + " ").match(PERIOD_LEAD) ?? (before + " ").match(NUMBER_LEAD) ?? (after.trim() ? after.match(PERIOD_LEAD) : null);
      let rest = after;
      if (lead) {
        num = Number(lead[1]);
        if ((before + " ").match(PERIOD_LEAD) || (before + " ").match(NUMBER_LEAD)) rest = `${before.replace(PERIOD_LEAD, "").replace(NUMBER_LEAD, "")} ${after}`;
        else rest = after.replace(PERIOD_LEAD, "");
      } else if (before.trim()) {
        rest = `${before} ${after}`; // "Mathematics 09:00-10:00"
      }
      const p = period(day, num, range, rest, line);
      if (p) ensureGroup().periods.push(p);
      continue;
    }

    // "P3 Science" - a period with no clock time.
    const pl = line.match(PERIOD_LEAD);
    if (pl) {
      const p = period(day, Number(pl[1]), null, line.slice(pl[0].length), line);
      if (p) ensureGroup().periods.push(p);
    }
  }
  return { groups: groups.filter((g) => g.periods.length > 0) };
}

/** True when the text reads as a timetable list the parser can handle on its own: several dated-by-day periods with times. */
export function timetableTextLooksParseable(text: string): boolean {
  if (text.replace(/\s+/g, "").length < 60) return false;
  const periods = parseTimetableText(text).groups.flatMap((g) => g.periods);
  return periods.filter((p) => p.day !== null && p.startTime !== null).length >= 4;
}
