// Turning what an extractor found into the editable preview, and the rules that keep that preview honest. Pure.
//
//  - A candidate's type comes from its title (or the AI reader's proposal when the title gives no answer); an unknown
//    type is "OTHER" and needs review.
//  - A date is only trusted when it is traceable to the text the candidate quotes. For the AI reader this matters: its
//    answer is re-read from its own quoted text with the same date parser the text path uses, and where the two disagree
//    or the quote does not contain the date at all, the row is flagged - the model is never taken at its word.
//  - Rows that repeat inside the document (same title, same date) are collapsed.
//  - Confidence is "high" only when nothing at all was assumed or doubtful; every other row needs review and starts
//    unticked in the screen.
import { classifyEventType } from "@/lib/calendar-import/classify";
import { academicYearOf, findDates, type DateContext } from "@/lib/calendar-import/dates";
import { EVENT_TYPES, type PreviewEvent, type PreviewSummary, type RawCandidate } from "@/lib/calendar-import/types";
import type { AcademicEventType } from "@prisma/client";

/** A key that identifies "the same event": same type-insensitive title words and same start day. */
export function eventKey(e: { title: string; startDate: string }): string {
  const title = e.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(the|a|an|of|for|and|day|holiday|holidays)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return `${e.startDate}|${title}`;
}

function asType(raw: string | null | undefined): AcademicEventType | null {
  const up = (raw ?? "").toUpperCase().trim();
  return (EVENT_TYPES as readonly string[]).includes(up) ? (up as AcademicEventType) : null;
}

/** Does the quoted source text actually contain this day (and a month name or number)? */
function sourceMentions(source: string, iso: string): boolean {
  const day = String(Number(iso.slice(8, 10)));
  const month = Number(iso.slice(5, 7));
  const hasDay = new RegExp(`(?<!\\d)0?${day}(?!\\d)`).test(source);
  const names = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
  const hasMonth = new RegExp(names[month - 1], "i").test(source) || new RegExp(`(?<!\\d)0?${month}(?!\\d)`).test(source);
  return hasDay && hasMonth;
}

export function normalizeCandidates(raw: RawCandidate[], ctx: { academicYear: string | null; dayFirst?: boolean | null; defaultYear?: number | null }): PreviewEvent[] {
  const seen = new Map<string, PreviewEvent>();
  let n = 0;
  for (const c of raw) {
    const title = c.title.replace(/\s+/g, " ").trim().slice(0, 200);
    if (!/[A-Za-z]{3}/.test(title)) continue;
    const warnings = [...c.warnings];
    let confidence: "high" | "review" = c.dateConfidence;
    let start = c.start;
    let end = c.end ?? null;

    // The AI reader's dates are cross-checked against the text it quotes: if that text yields a (different) date with the
    // same parser the text path uses, the text wins - it is what the document actually says. (The text parser's own dates
    // are its own reading of the text, so there is nothing to cross-check.)
    if (c.origin === "ai") {
      const dateCtx: DateContext = { academicYear: c.academicYear ?? ctx.academicYear, dayFirst: ctx.dayFirst ?? undefined, defaultYear: ctx.defaultYear ?? null };
      const fromText = findDates(c.sourceText, dateCtx).find((d) => d.start !== null);
      if (start && fromText?.start && fromText.start !== start) {
        warnings.push(`The date read from the document text (${fromText.start}) differs from the one proposed (${start}) - using the document text`);
        start = fromText.start;
        end = fromText.end;
        confidence = "review";
      } else if (start && !fromText && !sourceMentions(c.sourceText, start)) {
        warnings.push("The date could not be found in the text this event came from - check it against the document");
        confidence = "review";
      } else if (!start && fromText?.start) {
        start = fromText.start;
        end = fromText.end;
        if (fromText.confidence === "review") confidence = "review";
        warnings.push(...fromText.warnings);
      }
    }
    if (!start) {
      confidence = "review";
      if (!warnings.some((w) => /date/i.test(w))) warnings.push("No date was found - enter it or leave this row out");
    }
    if (start && end && end < start) {
      warnings.push("The end date is before the start date");
      confidence = "review";
    }

    const guessed = classifyEventType(title);
    const proposed = asType(c.type);
    let type: AcademicEventType = guessed.type;
    if (!guessed.confident) {
      if (proposed && proposed !== "OTHER") {
        type = proposed;
        warnings.push("The event type was suggested by the reader, not recognised from the title - check it");
        confidence = "review";
      } else {
        confidence = "review";
        warnings.push("Event type not recognised - please choose one");
      }
    } else if (proposed && proposed !== guessed.type && proposed !== "OTHER") {
      warnings.push(`Looks like "${guessed.type.toLowerCase()}" from the title; the reader suggested "${proposed.toLowerCase()}"`);
      confidence = "review";
    }

    const academicYear = c.academicYear ?? ctx.academicYear ?? (start ? academicYearOf(start) : "");
    if (confidence === "high" && warnings.length > 0) confidence = "review";

    const event: PreviewEvent = {
      id: `row-${++n}`,
      title,
      type,
      startDate: start ?? "",
      endDate: end && end !== start ? end : "",
      description: (c.description ?? "").trim().slice(0, 2000),
      academicYear: academicYear ?? "",
      confidence,
      warnings: [...new Set(warnings)],
      sourceText: c.sourceText,
    };
    const key = event.startDate ? eventKey(event) : `nodate|${event.title.toLowerCase()}|${n}`;
    const existing = seen.get(key);
    if (existing) {
      // The same event twice in one document: keep the first, and let the administrator know it was repeated.
      if (!existing.warnings.includes("Appears more than once in the document - kept once")) existing.warnings.push("Appears more than once in the document - kept once");
      continue;
    }
    seen.set(key, event);
  }
  return [...seen.values()].sort((a, b) => (a.startDate || "9999").localeCompare(b.startDate || "9999") || a.title.localeCompare(b.title));
}

export function summarize(events: PreviewEvent[]): PreviewSummary {
  const high = events.filter((e) => e.confidence === "high").length;
  return { total: events.length, high, review: events.length - high };
}

/** "12 events detected - 9 high confidence - 3 need review." */
export function summaryText(s: PreviewSummary): string {
  return `${s.total} event${s.total === 1 ? "" : "s"} detected — ${s.high} high confidence — ${s.review} need review`;
}
