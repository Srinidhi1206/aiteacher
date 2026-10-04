// The AI reader for timetables: used for what the text parser cannot read - an image of a timetable, a scanned PDF, or a
// grid whose text layer is a jumble. Same Gemini key and model failover as the AI Tutor; no new service. It is told to copy
// only what is written, to quote the source text for each period, to keep several classes apart and to leave blank anything
// absent. Its answer is never trusted: lib/timetable/normalize.ts re-reads the times from the quoted text and flags every
// disagreement, and the administrator reviews every row.
import "server-only";
import { z } from "zod";
import { geminiModelChain } from "@/lib/ai/provider";
import { parseDay, parseTime } from "@/lib/timetable/parts";
import type { ExtractedTimetable, RawGroup, RawPeriod } from "@/lib/timetable/types";

export type TimetableReaderInput = { kind: "text"; text: string } | { kind: "file"; bytes: Uint8Array; mimeType: string };
export type TimetableReader = (input: TimetableReaderInput) => Promise<ExtractedTimetable>;

export class TimetableReaderUnavailableError extends Error {
  constructor(message = "The AI reader is not available right now.") {
    super(message);
    this.name = "ReaderUnavailableError";
  }
}

const outputSchema = z.object({
  classes: z
    .array(
      z.object({
        className: z.string().nullish(),
        section: z.string().nullish(),
        title: z.string().nullish(),
        academicYear: z.string().nullish(),
        periods: z
          .array(
            z.object({
              day: z.string().nullish(),
              period: z.union([z.number(), z.string()]).nullish(),
              startTime: z.string().nullish(),
              endTime: z.string().nullish(),
              subject: z.string(),
              teacher: z.string().nullish(),
              room: z.string().nullish(),
              sourceText: z.string().nullish(),
            })
          )
          .max(400),
      })
    )
    .max(40),
});

const PROMPT = `You are reading a school TIMETABLE (a document or a picture of one) and listing its periods.

Rules - follow them exactly:
1. List ONLY periods that are written in the document. Never add a period, subject, teacher, room or time that you do not see. Never guess or fill gaps.
2. A document can hold several classes or sections. Keep each one separate, with its heading exactly as written in "className" (for example "Class 10-A", "X B"; use "" if no heading is shown) and "section" if a section letter is written separately.
3. For each period give: "day" as written (Monday, Tue ...), "period" the period number if one is written (otherwise null), "startTime" and "endTime" exactly as written including any am/pm (null if the document gives no clock times), "subject" exactly as written, "teacher" and "room" only if written beside that period (otherwise null), and "sourceText": the cell or row it came from, word for word.
4. Include breaks, lunch and assembly if they are shown as periods, with the subject as written (for example "Lunch break").
5. If a cell is empty or unreadable, leave that period out. Do not repeat a period across days unless the document shows it on each day.
6. Answer with JSON only, in this shape: {"classes": [{"className": string, "section": string|null, "title": string|null, "academicYear": string|null, "periods": [{"day": string, "period": number|null, "startTime": string|null, "endTime": string|null, "subject": string, "teacher": string|null, "room": string|null, "sourceText": string}]}]}`;

/** Pure: turns the reader's JSON into groups, reading days and times with the same parsers the text path uses. */
export function convertTimetableOutput(json: unknown): ExtractedTimetable {
  const parsed = outputSchema.safeParse(json);
  if (!parsed.success) return { groups: [] };
  const groups: RawGroup[] = parsed.data.classes.map((c) => ({
    className: (c.className ?? "").trim().slice(0, 80),
    section: (c.section ?? "").trim().slice(0, 10).toUpperCase(),
    title: c.title ?? null,
    academicYear: c.academicYear ?? null,
    periods: c.periods.map((p): RawPeriod => {
      const warnings: string[] = [];
      const day = p.day ? parseDay(p.day) : null;
      if (!day) warnings.push(p.day ? `The day "${p.day.slice(0, 20)}" was not recognised - choose the day` : "No day was given - choose the day");
      const start = p.startTime ? parseTime(p.startTime) : null;
      const end = p.endTime ? parseTime(p.endTime) : null;
      if (p.startTime && !start) warnings.push(`The start time "${p.startTime.slice(0, 20)}" could not be read`);
      if (p.endTime && !end) warnings.push(`The end time "${p.endTime.slice(0, 20)}" could not be read`);
      const num = p.period === null || p.period === undefined ? null : Number(String(p.period).replace(/\D/g, ""));
      return {
        origin: "ai",
        day,
        period: num && Number.isFinite(num) && num > 0 && num <= 20 ? num : null,
        startTime: start?.time ?? null,
        endTime: end?.time ?? null,
        subject: p.subject.trim().slice(0, 100),
        teacher: p.teacher?.trim().slice(0, 100) || null,
        room: p.room?.trim().slice(0, 30) || null,
        sourceText: (p.sourceText || [p.day, p.startTime && p.endTime ? `${p.startTime}-${p.endTime}` : "", p.subject].filter(Boolean).join(" ")).slice(0, 300),
        warnings,
      };
    }),
  }));
  return { groups: groups.filter((g) => g.periods.length > 0) };
}

function parseJson(text: string): unknown {
  return JSON.parse(text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, ""));
}

/** The reader backed by Gemini, or null when the AI provider is not configured. */
export function getGeminiTimetableReader(): TimetableReader | null {
  if (process.env.AI_PROVIDER?.trim().toLowerCase() !== "gemini" || !process.env.GEMINI_API_KEY) return null;
  const apiKey = process.env.GEMINI_API_KEY;
  return async (input) => {
    const { GoogleGenAI } = await import("@google/genai");
    const ai = new GoogleGenAI({ apiKey });
    const parts =
      input.kind === "text"
        ? [{ text: `${PROMPT}\n\nDOCUMENT TEXT:\n${input.text.slice(0, 60_000)}` }]
        : [{ text: PROMPT }, { inlineData: { mimeType: input.mimeType, data: Buffer.from(input.bytes).toString("base64") } }];
    let lastStatus: number | undefined;
    for (const model of geminiModelChain()) {
      try {
        const res = await ai.models.generateContent({
          model,
          contents: [{ role: "user", parts }],
          config: { temperature: 0, responseMimeType: "application/json", maxOutputTokens: 16_000, abortSignal: AbortSignal.timeout(50_000) },
        });
        if (!res.text) continue;
        return convertTimetableOutput(parseJson(res.text));
      } catch (err) {
        const status = (err as { status?: number } | null)?.status;
        lastStatus = status;
        if (status === 404 || status === 429 || status === 500 || status === 503 || status === 504) continue;
        break;
      }
    }
    // eslint-disable-next-line no-console
    console.error("[timetable-import] AI reader failed", lastStatus ? { status: lastStatus } : {});
    throw new TimetableReaderUnavailableError(lastStatus === 429 ? "The AI reader is busy or out of quota right now. Try again later." : "The AI reader could not read this document right now.");
  };
}
