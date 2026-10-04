// Reading events out of the TEXT of an academic calendar (a PDF's text layer, or text an OCR step produced). Line based:
// a line that holds a date and some words is an event ("15 Aug - Independence Day", "Unit Test 1 | 12 Oct - 14 Oct"); a
// line that is only a date takes its title from the next line; day-only lines under a month heading ("OCTOBER 2026" /
// "5 - Gandhi Jayanti") are placed in that month. Calendars drawn as grids usually do not survive as text this way, which
// is why the importer falls back to the AI reader for those - and why anything the parser is unsure of is flagged.
import { findDates, inferAcademicYear, detectNumericOrder, monthHeading, type DateContext, type ParsedDate } from "@/lib/calendar-import/dates";
import type { ExtractedCalendar, RawCandidate } from "@/lib/calendar-import/types";

const WEEKDAY = /\b(?:mon(?:day)?|tue(?:s(?:day)?)?|wed(?:nesday)?|thu(?:r(?:s(?:day)?)?)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?)\b\.?/gi;
// Column headings and table furniture that are never an event title.
const NOT_A_TITLE = /^(?:date|dates|day|days|event|events|particulars|description|remarks?|month|s\.?\s*no\.?|sl\.?\s*no\.?|no\.?|details?|activity|activities|schedule|calendar|total|working days?)$/i;

function removeSpans(line: string, dates: ParsedDate[]): string {
  let out = "";
  let at = 0;
  for (const d of dates) {
    out += line.slice(at, d.index) + " ";
    at = d.endIndex;
  }
  return out + line.slice(at);
}

function cleanTitle(raw: string): string {
  return raw
    .replace(WEEKDAY, " ")
    .replace(/\(\s*\)/g, " ")
    .replace(/[|	]+/g, " ")
    .replace(/^\s*\d{1,2}\s*[.)]\s+/, "") // "3. " list numbering
    .replace(/^[\s\-–—:;,.*•·>]+|[\s\-–—:;,.*•·]+$/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
}

function usableTitle(title: string): boolean {
  return /[A-Za-z]{3}/.test(title) && !NOT_A_TITLE.test(title);
}

function candidate(title: string, d: ParsedDate, source: string, extraWarnings: string[] = []): RawCandidate {
  const warnings = [...d.warnings, ...extraWarnings];
  return {
    origin: "text",
    title,
    start: d.start,
    end: d.end,
    sourceText: source.trim().slice(0, 300),
    dateConfidence: warnings.length > 0 ? "review" : d.confidence,
    warnings,
  };
}

const DAY_ONLY = /^(\d{1,2})(?:\s*(?:-|–|—|to)\s*(\d{1,2}))?\s*([:.)\-–—])?\s+(.+)$/;

export function parseCalendarText(text: string, opts: { defaultYear?: number | null } = {}): ExtractedCalendar {
  const academicYear = inferAcademicYear(text);
  const dayFirst = detectNumericOrder(text);
  const base: DateContext = { academicYear, dayFirst, defaultYear: opts.defaultYear ?? null };
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.replace(/[\t|]+/g, " | ").replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const out: RawCandidate[] = [];
  let heading: { month: number; year: number | null } | null = null;
  let pending: { dates: ParsedDate[]; source: string } | null = null;

  for (const line of lines) {
    const h = monthHeading(line);
    if (h) {
      heading = h;
      pending = null;
      continue;
    }

    const dates = findDates(line, { ...base, heading });
    if (dates.length > 0) {
      const title = cleanTitle(removeSpans(line, dates));
      if (usableTitle(title)) {
        const multi = dates.length > 1 ? ["Several dates on one line - check each one belongs to this event"] : [];
        for (const d of dates) out.push(candidate(title, d, line, multi));
        pending = null;
      } else {
        pending = { dates, source: line };
      }
      continue;
    }

    // A date-only line above: this line is its title.
    if (pending) {
      const title = cleanTitle(line);
      if (usableTitle(title)) {
        for (const d of pending.dates) out.push(candidate(title, d, `${pending.source} ${line}`));
        pending = null;
        continue;
      }
      pending = null;
    }

    // "5 - Gandhi Jayanti" under an "OCTOBER 2026" heading.
    if (heading) {
      const m = line.match(DAY_ONLY);
      if (m) {
        const title = cleanTitle(m[4]);
        const first = Number(m[1]);
        const second = m[2] ? Number(m[2]) : null;
        if (usableTitle(title) && first >= 1 && first <= 31 && (second === null || (second >= first && second <= 31))) {
          const text = `${m[1]}${second ? `-${m[2]}` : ""} ${monthName(heading.month)}${heading.year ? ` ${heading.year}` : ""}`;
          const dated = findDates(text, { ...base, heading });
          if (dated.length === 1) {
            // "12. Something" / "3) Something" reads like list numbering rather than a day - say so.
            const listLike = m[3] === "." || m[3] === ")";
            out.push(candidate(title, dated[0], line, listLike ? ["The number before the title might be a list number, not a day"] : []));
          }
        }
      }
    }
  }

  return { academicYear, candidates: out };
}

const MONTH_NAMES = ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
function monthName(n: number): string {
  return MONTH_NAMES[n] ?? "";
}

/** True when the text looks like a calendar the parser can read on its own (enough dated lines), so the AI reader is not needed. */
export function textLooksParseable(text: string): boolean {
  if (text.replace(/\s+/g, "").length < 80) return false;
  return parseCalendarText(text).candidates.filter((c) => c.start !== null).length >= 3;
}

