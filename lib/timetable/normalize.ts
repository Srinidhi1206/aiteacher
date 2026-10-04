// Turning what an extractor found into the editable preview, and the rules that make wrong readings easy to spot. Pure.
//  - A row is "high" confidence only when the day, the subject and (a period number or both times) are all present and
//    nothing doubtful was noticed; everything else is "review" and says why.
//  - Times given by the AI reader must be traceable to the text it quotes (the digits of the time appear in it); if not, the row
//    is flagged - the reader is never taken at its word.
//  - Periods in the same class and day that overlap, or run backwards, are flagged - the commonest sign of an OCR slip.
//  - An exact repeat (same day, time and subject) is kept once.
//  - Nothing is ever filled in: a missing day, time, teacher or room stays empty.
import { isValidTime, parseClassHeading } from "@/lib/timetable/parts";
import type { ExtractedTimetable, PreviewGroup, PreviewPeriod, RawPeriod, TimetableSummary } from "@/lib/timetable/types";

function digitsOf(s: string): string {
  return s.replace(/\D/g, "");
}

/** Are the digits of an HH:MM time present in the quoted source text (as 9:00, 09:00, 9.00 or 0900)? */
function timeInSource(time: string, source: string): boolean {
  const [h, m] = time.split(":");
  const hour12 = String(((Number(h) + 11) % 12) + 1);
  const src = source.replace(/\s+/g, "");
  return [`${h}:${m}`, `${Number(h)}:${m}`, `${hour12}:${m}`, `${h}.${m}`, `${Number(h)}.${m}`, `${hour12}.${m}`, `${h}${m}`].some((v) => src.includes(v)) || digitsOf(src).includes(`${Number(h)}${m}`);
}

function toPreview(p: RawPeriod, n: number): PreviewPeriod {
  const warnings = [...p.warnings];
  let confidence: "high" | "review" = warnings.length > 0 ? "review" : "high";
  const start = p.startTime && isValidTime(p.startTime) ? p.startTime : "";
  const end = p.endTime && isValidTime(p.endTime) ? p.endTime : "";

  if (p.origin === "ai") {
    for (const [label, t] of [["start", start], ["end", end]] as const) {
      if (t && !timeInSource(t, p.sourceText)) {
        warnings.push(`The ${label} time ${t} could not be found in the text this period came from - check it against the document`);
        confidence = "review";
      }
    }
  }
  if (!p.day) {
    confidence = "review";
    if (!warnings.some((w) => /day/i.test(w))) warnings.push("The day is missing - choose it");
  }
  if (!p.period && !start) {
    confidence = "review";
    warnings.push("Neither a period number nor a time was found for this row");
  }
  if ((start && !end) || (!start && end)) {
    confidence = "review";
    warnings.push("Only one of the start and end times was found");
  }
  if (start && end && end <= start) {
    confidence = "review";
    if (!warnings.some((w) => /end time/i.test(w))) warnings.push("The end time is not after the start time");
  }
  if (!/[A-Za-z]{2}/.test(p.subject)) confidence = "review";
  if (warnings.length > 0) confidence = "review";
  return {
    id: `p-${n}`,
    day: p.day ?? 0,
    period: p.period ? String(p.period) : "",
    startTime: start,
    endTime: end,
    subject: p.subject.trim(),
    teacher: (p.teacher ?? "").trim(),
    room: (p.room ?? "").trim(),
    confidence,
    warnings: [...new Set(warnings)],
    sourceText: p.sourceText,
  };
}

/** Flags periods that overlap an earlier one in the same day (modifies the rows' warnings and confidence). */
export function flagOverlaps(periods: PreviewPeriod[]): void {
  const byDay = new Map<number, PreviewPeriod[]>();
  for (const p of periods) if (p.day && p.startTime && p.endTime) byDay.set(p.day, [...(byDay.get(p.day) ?? []), p]);
  for (const list of byDay.values()) {
    list.sort((a, b) => a.startTime.localeCompare(b.startTime));
    for (let i = 1; i < list.length; i++) {
      const prev = list[i - 1];
      const cur = list[i];
      if (cur.startTime < prev.endTime) {
        const msg = `Overlaps the previous period (${prev.subject}, ${prev.startTime}-${prev.endTime}) - one of the times may be misread`;
        for (const row of [prev, cur]) {
          if (!row.warnings.includes(msg) && row === cur) row.warnings.push(msg);
          row.confidence = "review";
        }
      }
    }
  }
}

export function normalizeTimetable(raw: ExtractedTimetable): PreviewGroup[] {
  let n = 0;
  let g = 0;
  const groups: PreviewGroup[] = [];
  for (const group of raw.groups) {
    const seen = new Set<string>();
    const periods: PreviewPeriod[] = [];
    const notes: string[] = [];
    let dropped = 0;
    for (const rp of group.periods) {
      if (!/[A-Za-z]{2}/.test(rp.subject)) {
        dropped++;
        continue;
      }
      const row = toPreview(rp, ++n);
      const key = `${row.day}|${row.startTime}|${row.period}|${row.subject.toLowerCase()}`;
      if (seen.has(key)) {
        notes.push(`"${row.subject}" on ${row.day || "an unknown day"} at ${row.startTime || "an unknown time"} appeared more than once - kept once`);
        continue;
      }
      seen.add(key);
      periods.push(row);
    }
    if (dropped > 0) notes.push(`${dropped} row${dropped === 1 ? " had" : "s had"} no readable subject and ${dropped === 1 ? "was" : "were"} left out`);
    if (periods.length === 0) continue;
    flagOverlaps(periods);
    periods.sort((a, b) => (a.day || 9) - (b.day || 9) || (a.startTime || "99:99").localeCompare(b.startTime || "99:99") || Number(a.period || 99) - Number(b.period || 99));
    const heading = parseClassHeading(group.className) ?? null;
    groups.push({
      id: `g-${++g}`,
      className: group.className,
      section: group.section || heading?.section || "",
      title: (group.title ?? "").trim(),
      academicYear: (group.academicYear ?? "").trim(),
      periods,
      notes,
    });
  }
  return groups;
}

export function summarizeTimetable(groups: PreviewGroup[]): TimetableSummary {
  const all = groups.flatMap((g) => g.periods);
  const high = all.filter((p) => p.confidence === "high").length;
  return { classes: groups.length, periods: all.length, high, review: all.length - high };
}

/** "3 classes, 96 periods detected - 90 high confidence - 6 need review". */
export function timetableSummaryText(s: TimetableSummary): string {
  return `${s.classes} class${s.classes === 1 ? "" : "es"}, ${s.periods} period${s.periods === 1 ? "" : "s"} detected — ${s.high} high confidence — ${s.review} need review`;
}

/** Which of the school's classes a detected heading most likely is - the administrator can always change it. */
export function suggestClass<T extends { id: string; grade: number }>(group: { className: string }, classes: T[]): T | null {
  const heading = parseClassHeading(group.className);
  if (!heading || heading.grade === null) return null;
  const matches = classes.filter((c) => c.grade === heading.grade);
  return matches.length === 1 ? matches[0] : null;
}
