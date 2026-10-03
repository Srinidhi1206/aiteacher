// The course outline (units/chapters and their lessons) as the AI Tutor's source for STRUCTURE questions - "what is the
// first lesson?", "how many units are there?", "what comes after Unit 3?". Those are answered from the curriculum an
// administrator set up (the textbook's own table of contents), not by guessing which scanned page looks most similar -
// similarity search cannot count or order anything. Pure formatting/detection functions plus one small loader that takes
// its database handle as a parameter, so all of it can be tested on its own.
import type { prisma } from "@/lib/prisma";

export interface OutlineSubject {
  name: string;
  chapters: { name: string; topics: string[] }[];
}

const MAX_CHARS = 4000;
const MAX_CHAPTERS_PER_SUBJECT = 40;

// Questions about where something sits in the book. Several small patterns instead of one long one, so each is readable.
const UNIT = String.raw`(?:lesson|unit|chapter)s?`;
const STRUCTURE_PATTERNS: RegExp[] = [
  // "first lesson", "next unit", "last chapter", "second poem lesson"
  new RegExp(String.raw`\b(?:first|second|third|fourth|fifth|sixth|seventh|eighth|last|final|next|previous|opening|closing)\s+(?:\w+\s+)?${UNIT}\b`, "i"),
  // "how many units", "how many lessons are there"
  new RegExp(String.raw`\bhow many\s+(?:\w+\s+)?${UNIT}\b`, "i"),
  // "what comes after Unit 3", "which unit follows unit 2", "what is before the lesson The Journey"
  new RegExp(String.raw`\b(?:comes?|follows?|is|are|was|were)\s+(?:right\s+)?(?:after|before)\s+(?:the\s+)?(?:\w+\s+)?${UNIT}\b`, "i"),
  new RegExp(String.raw`\b${UNIT}\s+(?:comes?|follows?)\s+(?:right\s+)?(?:after|before)\b`, "i"),
  new RegExp(String.raw`\bwhich\s+${UNIT}\s+follows?\b`, "i"),
  // "list the lessons", "name all the units", "show me the chapters"
  new RegExp(String.raw`\b(?:list|name|give me|show me|tell me)\s+(?:all\s+)?(?:the\s+)?(?:\w+\s+)?(?:lessons|units|chapters)\b`, "i"),
  // "table of contents", "syllabus", "what is in my textbook"
  /\b(?:table of contents|contents page|syllabus|course outline|what is covered|what(?:'s| is) in (?:this|the|my) (?:textbook|book))\b/i,
];
// A question that also asks for the content of a lesson needs the book's text as well as the outline.
const CONTENT_RE = /\b(?:about|summar\w*|explain|story|poem|theme|moral|plot|happens?|characters?|meaning|teach|discuss|describe)\b/i;

export function isStructureQuestion(question: string): boolean {
  return STRUCTURE_PATTERNS.some((re) => re.test(question));
}

/** True when the outline alone answers it (no passage retrieval needed); false when the lesson's text matters too. */
export function isStructureOnlyQuestion(question: string): boolean {
  return isStructureQuestion(question) && !CONTENT_RE.test(question);
}

/**
 * Plain-text outline, in the administrator's order. Chapters with no lessons are left out when the subject has chapters
 * that do (an empty placeholder chapter would otherwise be reported as "the first lesson"). Capped so it can never swamp
 * the prompt; anything cut is said to be cut.
 */
export function formatOutline(subjects: OutlineSubject[]): string {
  const blocks: string[] = [];
  for (const s of subjects) {
    const anyTopics = s.chapters.some((c) => c.topics.length > 0);
    const chapters = s.chapters.filter((c) => !anyTopics || c.topics.length > 0);
    if (chapters.length === 0) continue;
    const shown = chapters.slice(0, MAX_CHAPTERS_PER_SUBJECT);
    const lines = shown.map((c, i) => `${i + 1}. ${c.name}${c.topics.length > 0 ? ` - lessons in order: ${c.topics.map((t, j) => `${j + 1}) ${t}`).join("; ")}` : ""}`);
    if (chapters.length > shown.length) lines.push(`(${chapters.length - shown.length} more not shown)`);
    blocks.push(`${s.name}:\n${lines.join("\n")}`);
  }
  const text = blocks.join("\n\n");
  return text.length > MAX_CHARS ? `${text.slice(0, MAX_CHARS)}\n(outline cut short)` : text;
}

export function outlinePromptBlock(outline: string): string {
  if (!outline) return "";
  return (
    "\n\n---\nCourse outline for the student's class: the official order of units/chapters and the lessons in each. " +
    "For questions about which lesson or unit is first, next or last, how many there are, or what a unit contains, answer from this outline and say it is the course outline. " +
    "Do not invent lessons that are not listed.\n\n" +
    outline
  );
}

export type OutlineDb = Pick<typeof prisma, "schoolClassSubject">;

/** The outline of the subjects enabled for a class, as the administrator structured them. */
export async function loadOutline(db: OutlineDb, schoolClassId: string): Promise<string> {
  const links = await db.schoolClassSubject.findMany({
    where: { schoolClassId, isEnabled: true },
    select: {
      subject: {
        select: {
          name: true,
          chapters: { orderBy: [{ order: "asc" }, { name: "asc" }], select: { name: true, topics: { orderBy: [{ order: "asc" }, { name: "asc" }], select: { name: true } } } },
        },
      },
    },
  });
  const subjects: OutlineSubject[] = links
    .map((l) => ({ name: l.subject.name, chapters: l.subject.chapters.map((c) => ({ name: c.name, topics: c.topics.map((t) => t.name) })) }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return formatOutline(subjects);
}
