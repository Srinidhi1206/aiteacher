// Finding dates in the text of an academic calendar. Pure functions only (no database, no network) so every rule can be
// tested on its own. The guiding rule of the whole importer is "never invent": a date is only produced when the text
// really states it; anything that had to be assumed (a missing year, an ambiguous 05/06/2026) is returned with a warning
// and `confidence: "review"` so the administrator sees it and decides. A date whose year cannot be known comes back with
// `start: null` rather than a guess.

export interface DateContext {
  /** "2026-27" - lets a day + month with no year be placed (June-December = first year, January-May = second). */
  academicYear?: string | null;
  /** A month heading the line sits under ("OCTOBER 2026"); used only when the line gives no year of its own. */
  heading?: { month: number; year: number | null } | null;
  /** Last resort for a missing year (for example the current year). Leave null to refuse to guess. */
  defaultYear?: number | null;
  /** true: 05/06/2026 is 5 June; false: it is May 6; null/undefined: not known (assumed day-first, flagged when it matters). */
  dayFirst?: boolean | null;
}

export interface ParsedDate {
  /** YYYY-MM-DD, or null when the date as written cannot be turned into a real date (no year, 31 February ...). */
  start: string | null;
  end: string | null;
  confidence: "high" | "review";
  warnings: string[];
  /** The text that was read as this date, and where it sat in the input. */
  text: string;
  index: number;
  endIndex: number;
}

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5, jun: 6, june: 6,
  jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9, oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};
const MONTH = "(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";
const ORD = "(?:st|nd|rd|th)?";
const SEP = "(?:-|–|—|to|till|until)";

export function monthNumber(word: string): number | null {
  return MONTHS[word.toLowerCase().replace(/\.$/, "")] ?? null;
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function iso(year: number, month: number, day: number): string | null {
  if (!Number.isInteger(year) || month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return null;
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function expandYear(raw: string): number {
  const n = Number(raw);
  return raw.length === 2 ? 2000 + n : n;
}

/** "2026-27" from text such as "Academic Year 2026-27" or "2026 - 2027"; only a consecutive pair counts. */
export function inferAcademicYear(text: string): string | null {
  for (const m of text.matchAll(/(?<!\d)(20\d{2})\s*[-–/]\s*(?:20)?(\d{2})(?!\d)/g)) {
    const start = Number(m[1]);
    const end = Number(m[2]);
    if ((start + 1) % 100 === end) return `${start}-${String(end).padStart(2, "0")}`;
  }
  return null;
}

/** The academic year (June to May) a date falls in. */
export function academicYearOf(isoDate: string): string {
  const y = Number(isoDate.slice(0, 4));
  const m = Number(isoDate.slice(5, 7));
  const first = m >= 6 ? y : y - 1;
  return `${first}-${String((first + 1) % 100).padStart(2, "0")}`;
}

function yearFor(month: number, explicit: number | null, ctx: DateContext): { year: number | null; assumed: boolean } {
  if (explicit !== null) return { year: explicit, assumed: false };
  if (ctx.heading && ctx.heading.month === month && ctx.heading.year !== null) return { year: ctx.heading.year, assumed: false };
  if (ctx.academicYear) {
    // The document itself states the academic year, so June-December belongs to its first year and January-May to its second.
    const first = Number(ctx.academicYear.slice(0, 4));
    return { year: month >= 6 ? first : first + 1, assumed: false };
  }
  if (ctx.defaultYear) return { year: ctx.defaultYear, assumed: true };
  return { year: null, assumed: true };
}

/** Does the document write numeric dates day-first? A date like 25/12/2026 proves it; 12/25/2026 proves month-first. */
export function detectNumericOrder(text: string): boolean | null {
  let dayFirst = false;
  let monthFirst = false;
  for (const m of text.matchAll(/(?<!\d)(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})(?!\d)/g)) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    if (a > 12 && b <= 12) dayFirst = true;
    if (b > 12 && a <= 12) monthFirst = true;
  }
  if (dayFirst && !monthFirst) return true;
  if (monthFirst && !dayFirst) return false;
  return null;
}

interface Raw {
  prio: number;
  index: number;
  endIndex: number;
  text: string;
  /** A single date or an already-formed range; `from` always set. */
  from: { day: number; month: number; year: number | null; numeric?: boolean; ambiguous?: boolean };
  to?: { day: number; month: number; year: number | null };
}

// "Unit Test 1 - 12 Oct 2026": the 1 belongs to the title ("Test 1"), so it must not be read as the start of a day range 1-12 Oct.
const LABEL_BEFORE_NUMBER = /\b(?:test|exam|term|unit|class|grade|std|standard|paper|round|part|pt|series|phase|section|chapter|lesson|week|session|cycle|slip|assessment|period|batch|group|level|fa|sa|ut|pa)s?\s*$/i;

function collect(text: string): Raw[] {
  const out: Raw[] = [];
  const push = (m: RegExpMatchArray, prio: number, from: Raw["from"], to?: Raw["to"]) =>
    out.push({ prio, index: m.index ?? 0, endIndex: (m.index ?? 0) + m[0].length, text: m[0], from, to });
  const labelled = (m: RegExpMatchArray) => LABEL_BEFORE_NUMBER.test(text.slice(0, m.index ?? 0));
  const y = (s: string | undefined) => (s ? expandYear(s) : null);

  // 2026-10-05
  for (const m of text.matchAll(/(?<!\d)(\d{4})-(\d{2})-(\d{2})(?!\d)/g)) push(m, 0, { day: Number(m[3]), month: Number(m[2]), year: Number(m[1]) });
  // 05/10/2026, 5-10-26 (day/month order is decided later)
  for (const m of text.matchAll(/(?<!\d)(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})(?!\d)/g)) push(m, 1, { day: Number(m[1]), month: Number(m[2]), year: y(m[3]), numeric: true });
  // 12 Oct - 14 Oct 2026   /   12th October 2026 to 14th October 2026
  for (const m of text.matchAll(new RegExp(`(?<!\\d)(\\d{1,2})${ORD}\\s*(${MONTH})\\b\\.?,?\\s*(\\d{4})?\\s*${SEP}\\s*(\\d{1,2})${ORD}\\s*(${MONTH})\\b\\.?,?\\s*(\\d{4})?`, "gi")))
    push(m, 2, { day: Number(m[1]), month: monthNumber(m[2])!, year: y(m[3]) }, { day: Number(m[4]), month: monthNumber(m[5])!, year: y(m[6]) });
  // 12-14 October 2026
  for (const m of text.matchAll(new RegExp(`(?<!\\d)(\\d{1,2})${ORD}\\s*${SEP}\\s*(\\d{1,2})${ORD}\\s+(${MONTH})\\b\\.?,?\\s*(\\d{4})?`, "gi"))) {
    if (labelled(m)) continue;
    push(m, 3, { day: Number(m[1]), month: monthNumber(m[3])!, year: y(m[4]) }, { day: Number(m[2]), month: monthNumber(m[3])!, year: y(m[4]) });
  }
  // October 12-14, 2026
  for (const m of text.matchAll(new RegExp(`\\b(${MONTH})\\b\\.?\\s+(\\d{1,2})(?!\\d)${ORD}\\s*${SEP}\\s*(\\d{1,2})(?!\\d)${ORD},?\\s*(\\d{4})?`, "gi")))
    push(m, 3, { day: Number(m[2]), month: monthNumber(m[1])!, year: y(m[4]) }, { day: Number(m[3]), month: monthNumber(m[1])!, year: y(m[4]) });
  // 5 Oct, 5th October 2026, 5-Oct-2026
  for (const m of text.matchAll(new RegExp(`(?<!\\d)(\\d{1,2})${ORD}[\\s.\\-/]*(?:of\\s+)?(${MONTH})\\b\\.?,?(?:\\s*[-'’]?\\s*(\\d{4}))?`, "gi")))
    push(m, 4, { day: Number(m[1]), month: monthNumber(m[2])!, year: y(m[3]) });
  // October 5, 2026 / Oct 5
  for (const m of text.matchAll(new RegExp(`\\b(${MONTH})\\b\\.?\\s+(\\d{1,2})(?!\\d)${ORD},?\\s*(\\d{4})?`, "gi")))
    push(m, 5, { day: Number(m[2]), month: monthNumber(m[1])!, year: y(m[3]) });
  return out;
}

function pick(raws: Raw[]): Raw[] {
  const sorted = [...raws].sort((a, b) => a.prio - b.prio || a.index - b.index);
  const taken: Raw[] = [];
  for (const r of sorted) if (!taken.some((t) => r.index < t.endIndex && t.index < r.endIndex)) taken.push(r);
  return taken.sort((a, b) => a.index - b.index);
}

function resolve(r: Raw, ctx: DateContext): ParsedDate {
  const warnings: string[] = [];
  let confidence: "high" | "review" = "high";
  const fix = (p: { day: number; month: number; year: number | null; numeric?: boolean }) => {
    let { day, month } = p;
    if (p.numeric) {
      if (ctx.dayFirst === false) [day, month] = [month, day];
      else if (ctx.dayFirst !== true && day <= 12 && month <= 12 && day !== month) {
        confidence = "review";
        warnings.push(`"${r.text.trim()}" could be day/month or month/day - read as day/month, please check`);
      }
    }
    const { year, assumed } = yearFor(month, p.year, ctx);
    if (year === null) {
      confidence = "review";
      warnings.push("No year is stated - enter the date");
      return null;
    }
    if (assumed) {
      confidence = "review";
      warnings.push(`Year not written next to the date - taken as ${year}, please check`);
    }
    const value = iso(year, month, day);
    if (!value) {
      confidence = "review";
      warnings.push(`"${r.text.trim()}" is not a real calendar date`);
    }
    return value;
  };
  // "12 Oct - 14 Oct 2026": the year written on one side applies to both.
  let inheritedEndYear = false;
  if (r.to) {
    if (r.from.year === null && r.to.year !== null) r.from = { ...r.from, year: r.to.year };
    else if (r.to.year === null && r.from.year !== null) {
      r.to = { ...r.to, year: r.from.year };
      inheritedEndYear = true;
    }
  }
  const start = fix(r.from);
  let end = r.to ? fix(r.to) : null;
  if (start && end && end < start) {
    // "28 Dec - 2 Jan" with no years: the end is in the following year
    if (r.to && (inheritedEndYear || (r.to.year === null && r.from.year === null))) {
      const y = Number(end.slice(0, 4)) + 1;
      const fixed = iso(y, Number(end.slice(5, 7)), Number(end.slice(8, 10)));
      if (fixed && fixed >= start) end = fixed;
    }
    if (end < start) {
      confidence = "review";
      warnings.push("The end date is before the start date");
    }
  }
  return { start, end: end && end !== start ? end : null, confidence, warnings: [...new Set(warnings)], text: r.text, index: r.index, endIndex: r.endIndex };
}

/**
 * Every date expression in `text`, in order. Two single dates joined only by a dash / "to" / "till" ("5 Oct - 7 Oct")
 * become one range. Nothing is returned for text that merely contains numbers.
 */
export function findDates(text: string, ctx: DateContext = {}): ParsedDate[] {
  const dayFirst = ctx.dayFirst !== undefined ? ctx.dayFirst : detectNumericOrder(text);
  const context = { ...ctx, dayFirst };
  const accepted = pick(collect(text));
  const out: ParsedDate[] = [];
  for (let i = 0; i < accepted.length; i++) {
    const cur = accepted[i];
    const next = accepted[i + 1];
    if (!cur.to && next && !next.to && new RegExp(`^\\s*${SEP}\\s*$`, "i").test(text.slice(cur.endIndex, next.index))) {
      const merged: Raw = { prio: cur.prio, index: cur.index, endIndex: next.endIndex, text: text.slice(cur.index, next.endIndex), from: cur.from, to: next.from };
      out.push(resolve(merged, context));
      i++;
    } else {
      out.push(resolve(cur, context));
    }
  }
  return out;
}

/** A line that is only a month heading ("OCTOBER 2026", "Oct-26", "October"): the month (and year, if shown) for the lines under it. */
export function monthHeading(line: string): { month: number; year: number | null } | null {
  const m = line.trim().match(new RegExp(`^(${MONTH})\\b\\.?[\\s,\\-–'’]*(\\d{4}|\\d{2})?$`, "i"));
  if (!m) return null;
  return { month: monthNumber(m[1])!, year: m[2] ? expandYear(m[2]) : null };
}
