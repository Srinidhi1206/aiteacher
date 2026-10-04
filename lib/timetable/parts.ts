// The small pieces a timetable is made of: clock times, days of the week, and class headings ("Class 10-A", "X B"). Pure.
// Same rule as the calendar importer: never assume. A time is only produced when the text states it; the ambiguous cases
// (1:15 with no am/pm) are returned with a warning for the administrator to confirm.

export interface ParsedTime {
  /** "HH:MM", 24-hour. */
  time: string;
  /** True when am/pm was written, so the hour is certain. */
  explicit: boolean;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** "9:00", "9.00", "09:00", "9:00 AM", "1.15pm", "13:15" -> HH:MM, or null. */
export function parseTime(raw: string): ParsedTime | null {
  const m = raw.trim().match(/^(\d{1,2})\s*[:.]\s*(\d{2})\s*([ap])?\.?m?\.?$/i) ?? raw.trim().match(/^(\d{1,2})\s*([ap])\.?m\.?$/i);
  if (!m) return null;
  const hasMinutes = m.length === 4;
  let hour = Number(m[1]);
  const minute = hasMinutes ? Number(m[2]) : 0;
  const meridiem = (hasMinutes ? m[3] : m[2])?.toLowerCase();
  if (minute > 59) return null;
  if (meridiem) {
    if (hour < 1 || hour > 12) return null;
    if (meridiem === "p" && hour < 12) hour += 12;
    if (meridiem === "a" && hour === 12) hour = 0;
  } else if (hour > 23) {
    return null;
  }
  return { time: `${pad(hour)}:${pad(minute)}`, explicit: !!meridiem };
}

export function isValidTime(s: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
}

export interface ParsedRange {
  start: string;
  end: string;
  /** Where the range sat in the input, so the rest of the line can be read as the subject. */
  index: number;
  endIndex: number;
  warnings: string[];
}

const TIME_TOKEN = "\\d{1,2}\\s*[:.]\\s*\\d{2}(?:\\s*[ap]\\.?m\\.?)?|\\d{1,2}\\s*[ap]\\.?m\\.?";
const RANGE_SEP = "(?:-|\\u2013|\\u2014|to|till|until|\\u2192)";

/** The first time range in the text ("09:00-10:00", "9.00 am to 9.45 am", "11:15 – 12:15"), or null. */
export function findTimeRange(text: string): ParsedRange | null {
  const re = new RegExp(`(?<![\\d:.])(${TIME_TOKEN})\\s*${RANGE_SEP}\\s*(${TIME_TOKEN})(?![\\d:])`, "i");
  const m = re.exec(text);
  if (!m) return null;
  const a = parseTime(m[1]);
  let b = parseTime(m[2]);
  if (!a || !b) return null;
  const warnings: string[] = [];
  // "9:00-10:00" with no am/pm: both read as written (24-hour). An early hour might really be the afternoon.
  if (!a.explicit && !b.explicit) {
    const [ah] = a.time.split(":").map(Number);
    const [bh] = b.time.split(":").map(Number);
    if (b.time <= a.time && bh < 12) {
      // "11:00 - 1:00": the end can only be after the start, so it is afternoon - but say so.
      const fixed = parseTime(`${bh + 12}:${b.time.slice(3)}`);
      if (fixed) {
        b = fixed;
        warnings.push(`"${m[0].trim()}": the end time has no am/pm, read as ${b.time} - please check`);
      }
    } else if (ah > 0 && ah < 7) {
      warnings.push(`"${m[0].trim()}": no am/pm is written and ${a.time} is early - this could be an afternoon period, please check`);
    }
  }
  if (b.time <= a.time) warnings.push(`"${m[0].trim()}": the end time is not after the start time`);
  return { start: a.time, end: b.time, index: m.index, endIndex: m.index + m[0].length, warnings };
}

const DAYS: [number, RegExp][] = [
  [1, /^mon(?:day)?s?\.?$/i],
  [2, /^tue(?:s(?:day)?)?s?\.?$/i],
  [3, /^wed(?:nesday)?s?\.?$/i],
  [4, /^thu(?:r(?:s(?:day)?)?)?s?\.?$/i],
  [5, /^fri(?:day)?s?\.?$/i],
  [6, /^sat(?:urday)?s?\.?$/i],
  [7, /^sun(?:day)?s?\.?$/i],
];

export const DAY_NAMES = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

/** "Monday", "Mon.", "THU" -> 1..7, or null. */
export function parseDay(token: string): number | null {
  const t = token.trim();
  for (const [n, re] of DAYS) if (re.test(t)) return n;
  return null;
}

/** A line that is just a day heading ("MONDAY", "Monday:", "Tuesday - Day 2") -> the day, else null. */
export function dayHeading(line: string): number | null {
  const m = line.trim().match(/^([A-Za-z]{3,9}\.?)\s*(?:[:\-–—]\s*.{0,20})?$/);
  return m ? parseDay(m[1]) : null;
}

const ROMAN: Record<string, number> = { I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6, VII: 7, VIII: 8, IX: 9, X: 10, XI: 11, XII: 12 };

export interface ClassHeading {
  grade: number | null;
  section: string;
}

/** "Class 10-A", "Grade 8 B", "10th Section C", "X - A", "Std VII" -> grade and section. null when the text is not a class heading. */
export function parseClassHeading(text: string): ClassHeading | null {
  const t = text.trim();
  const pattern = /^(?:time\s*table\s*[:\-–—]?\s*)?(?:(?:class|grade|std\.?|standard)\s*[:\-]?\s*)?(\d{1,2}|[IVX]{1,4})(?:st|nd|rd|th)?\s*(?:[-–—/]\s*|\s+)?(?:(?:section|sec\.?|div\.?|division)\s*[:\-]?\s*)?([A-Za-z])?\s*$/i;
  const labelled = /\b(?:class|grade|std\.?|standard)\b/i.test(t);
  const m = t.match(pattern);
  if (!m) return null;
  const rawGrade = m[1];
  const grade = /^\d+$/.test(rawGrade) ? Number(rawGrade) : ROMAN[rawGrade.toUpperCase()] ?? null;
  if (grade === null || grade < 1 || grade > 12) return null;
  // A bare "10" or "X" with no "Class" label is only a heading when a section letter follows ("X-A", "10 B").
  if (!labelled && !m[2]) return null;
  return { grade, section: (m[2] ?? "").toUpperCase() };
}
