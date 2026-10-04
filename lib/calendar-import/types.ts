// Shapes shared by the calendar importer. Nothing here touches the database.
import type { AcademicEventType } from "@prisma/client";

/** What an extractor (the text parser or the AI reader) found in a document, before it is checked and normalised. */
export interface RawCandidate {
  /** "text": found by the rule-based text parser (its own date reading is the evidence). "ai": proposed by the AI reader, so its date is re-checked against its quoted text. */
  origin: "text" | "ai";
  title: string;
  /** YYYY-MM-DD or null when the date could not be established. */
  start: string | null;
  end?: string | null;
  /** A type proposed by the AI reader; the text parser leaves it out and the title decides. */
  type?: string | null;
  description?: string | null;
  academicYear?: string | null;
  /** The text of the document this event came from, as close to verbatim as possible. Shown to the administrator. */
  sourceText: string;
  dateConfidence: "high" | "review";
  warnings: string[];
}

export interface ExtractedCalendar {
  academicYear: string | null;
  candidates: RawCandidate[];
}

/** One row of the editable preview. Nothing becomes a calendar event until the administrator confirms it. */
export interface PreviewEvent {
  /** Stable within one preview; lets the screen address a row. */
  id: string;
  title: string;
  type: AcademicEventType;
  /** YYYY-MM-DD, or "" when the date still has to be entered. */
  startDate: string;
  endDate: string;
  description: string;
  academicYear: string;
  confidence: "high" | "review";
  warnings: string[];
  sourceText: string;
}

export interface PreviewSummary {
  total: number;
  high: number;
  review: number;
}

export const EVENT_TYPES = ["EXAM", "HOLIDAY", "RESULT", "MEETING", "EVENT", "DEADLINE", "TERM", "OTHER"] as const;
