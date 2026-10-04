// The AI reader: used for what the text parser cannot read - an image of a calendar, a scanned PDF with no text layer, or a
// text layer that came out as a jumble (calendars drawn as grids). It uses the same Gemini key and model failover as the AI
// Tutor; no new service. It is told to extract ONLY what is written, to quote the source text for every event, and to leave
// out anything it cannot read - and its answer is still never trusted: lib/calendar-import/normalize.ts re-reads each
// date from the quoted text and flags every disagreement. The original document is never altered.
import "server-only";
import { z } from "zod";
import { findDates, inferAcademicYear } from "@/lib/calendar-import/dates";
import type { ExtractedCalendar, RawCandidate } from "@/lib/calendar-import/types";
import { geminiModelChain } from "@/lib/ai/provider";

export type ReaderInput = { kind: "text"; text: string } | { kind: "file"; bytes: Uint8Array; mimeType: string };
export type AiReader = (input: ReaderInput) => Promise<ExtractedCalendar>;

export class ReaderUnavailableError extends Error {
  constructor(message = "The AI reader is not available right now.") {
    super(message);
    this.name = "ReaderUnavailableError";
  }
}

const outputSchema = z.object({
  academicYear: z.string().nullish(),
  events: z
    .array(
      z.object({
        title: z.string(),
        dateText: z.string().nullish(),
        endDateText: z.string().nullish(),
        type: z.string().nullish(),
        description: z.string().nullish(),
        sourceText: z.string().nullish(),
      })
    )
    .max(400),
});

const PROMPT = `You are reading a school ACADEMIC CALENDAR (a document or a picture of one) and listing the events it states.

Rules - follow them exactly:
1. List ONLY events that are written in the document. Never add an event, a date or a holiday that you do not see. Never guess or fill gaps.
2. For every event copy the date EXACTLY as written (for example "12 Oct - 14 Oct", "5th October 2026", "Oct 5") into "dateText", and the whole row or cell it came from, word for word, into "sourceText". If a range is written, put the full range in "dateText".
3. Do not convert dates and do not add a year the document does not show. If the document shows the academic year (for example "2026-27") put it in "academicYear", otherwise null.
4. "type" is your best classification of the title, one of: EXAM, HOLIDAY, RESULT, MEETING, EVENT, DEADLINE, TERM, OTHER. Use OTHER when unsure.
5. If a date is unreadable or missing, still list the event but leave "dateText" empty. If an event itself is unreadable, leave it out.
6. Ignore weekday letters, working-day counts, legends, logos and instructions that are not events. Put extra wording that belongs to an event (a note beside it) in "description"; leave it out if there is none.
7. Answer with JSON only, in this shape: {"academicYear": string|null, "events": [{"title": string, "dateText": string, "endDateText": string|null, "type": string, "description": string|null, "sourceText": string}]}`;

/** Pure: turns the reader's JSON into candidates, re-reading each date from the text with the same parser the text path uses. */
export function convertReaderOutput(json: unknown, hintText = ""): ExtractedCalendar {
  const parsed = outputSchema.safeParse(json);
  if (!parsed.success) return { academicYear: null, candidates: [] };
  const academicYear = (parsed.data.academicYear && inferAcademicYear(parsed.data.academicYear)) || inferAcademicYear(hintText) || null;
  const candidates: RawCandidate[] = parsed.data.events.map((e) => {
    const written = [e.dateText, e.endDateText].filter(Boolean).join(" - ");
    const dates = written ? findDates(written, { academicYear }) : [];
    const first = dates.find((d) => d.start !== null) ?? null;
    const warnings = first ? [...first.warnings] : [];
    if (!first) warnings.push(written ? `The date as written ("${written.slice(0, 60)}") could not be read` : "No date was given for this event");
    return {
      origin: "ai",
      title: e.title.trim().slice(0, 200),
      start: first?.start ?? null,
      end: first?.end ?? null,
      type: e.type ?? null,
      description: e.description ?? null,
      academicYear,
      sourceText: (e.sourceText || written || e.title).slice(0, 300),
      dateConfidence: first && warnings.length === 0 ? first.confidence : "review",
      warnings,
    };
  });
  return { academicYear, candidates };
}

function parseJson(text: string): unknown {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  return JSON.parse(trimmed);
}

/** The reader backed by Gemini, or null when the AI provider is not configured. */
export function getGeminiReader(): AiReader | null {
  if (process.env.AI_PROVIDER?.trim().toLowerCase() !== "gemini" || !process.env.GEMINI_API_KEY) return null;
  const apiKey = process.env.GEMINI_API_KEY;
  return async (input) => {
    const { GoogleGenAI } = await import("@google/genai");
    const ai = new GoogleGenAI({ apiKey });
    const parts =
      input.kind === "text"
        ? [{ text: `${PROMPT}\n\nDOCUMENT TEXT:\n${input.text.slice(0, 60_000)}` }]
        : [{ text: PROMPT }, { inlineData: { mimeType: input.mimeType, data: Buffer.from(input.bytes).toString("base64") } }];
    const models = geminiModelChain();
    let lastStatus: number | undefined;
    for (const model of models) {
      try {
        const res = await ai.models.generateContent({
          model,
          contents: [{ role: "user", parts }],
          config: { temperature: 0, responseMimeType: "application/json", maxOutputTokens: 16_000, abortSignal: AbortSignal.timeout(50_000) },
        });
        const text = res.text;
        if (!text) continue;
        return convertReaderOutput(parseJson(text), input.kind === "text" ? input.text : "");
      } catch (err) {
        const status = (err as { status?: number } | null)?.status;
        lastStatus = status;
        // Overloaded, retired or out of quota: try the next model. Anything else (bad JSON, timeout) ends the attempt.
        if (status === 404 || status === 429 || status === 500 || status === 503 || status === 504) continue;
        break;
      }
    }
    // eslint-disable-next-line no-console
    console.error("[calendar-import] AI reader failed", lastStatus ? { status: lastStatus } : {});
    throw new ReaderUnavailableError(lastStatus === 429 ? "The AI reader is busy or out of quota right now. Try again later." : "The AI reader could not read this document right now.");
  };
}
