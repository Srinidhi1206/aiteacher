// Shapes shared by the timetable importer. Nothing here touches the database.

/** One period as an extractor found it, before it is checked and normalised. */
export interface RawPeriod {
  /** "text": found by the rule-based text parser. "ai": proposed by the AI reader, so its times are re-checked against its quoted text. */
  origin: "text" | "ai";
  /** 1 = Monday ... 7 = Sunday, or null when the day could not be determined. */
  day: number | null;
  period: number | null;
  startTime: string | null; // HH:MM
  endTime: string | null;
  subject: string;
  teacher?: string | null;
  room?: string | null;
  /** The text of the document this period came from, as close to verbatim as possible. */
  sourceText: string;
  warnings: string[];
}

/** One class's timetable as found in the document (a document can hold several). */
export interface RawGroup {
  /** The class heading as written ("Class 10-A", "X B"), or "" when the document gives none. */
  className: string;
  section: string;
  title?: string | null;
  academicYear?: string | null;
  periods: RawPeriod[];
}

export interface ExtractedTimetable {
  groups: RawGroup[];
}

/** One editable row of the preview. Nothing is saved until the administrator confirms. */
export interface PreviewPeriod {
  id: string;
  day: number; // 1-7, or 0 while the day is still unknown
  period: string; // "" or a number as text
  startTime: string; // "" or HH:MM
  endTime: string;
  subject: string;
  teacher: string;
  room: string;
  confidence: "high" | "review";
  warnings: string[];
  sourceText: string;
}

export interface PreviewGroup {
  id: string;
  /** The heading as written in the document, shown so the administrator can see what was detected. */
  className: string;
  section: string;
  title: string;
  academicYear: string;
  periods: PreviewPeriod[];
  /** Notes about the group as a whole. */
  notes: string[];
}

export interface TimetableSummary {
  classes: number;
  periods: number;
  high: number;
  review: number;
}
