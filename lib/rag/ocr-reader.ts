// The AI reader for OCR: sends rendered page images to Gemini (same key and model failover as the AI Tutor - no new service) and
// returns one transcription per page. Its answer is never trusted blindly: lib/rag/ocr.ts parses it strictly and validateOcrWindow
// refuses the failures that can be detected, and the original PDF is never modified.
import "server-only";
import { geminiModelChain } from "@/lib/ai/provider";
import { buildOcrPrompt, parseOcrResponse } from "@/lib/rag/ocr";

export class OcrReaderUnavailableError extends Error {
  constructor(message = "The AI reader is not available right now.", readonly quota = false) {
    super(message);
    this.name = "OcrReaderUnavailableError";
  }
}

// Models that read these pages accurately (checked against pages whose text was read by eye). The free tier counts requests per DAY per model,
// so a long book needs several; the configured tutor models come first, then these, and the oldest, least accurate one last.
const OCR_EXTRA_MODELS = ["gemini-3.8-flash", "gemini-3.7-flash", "gemini-3-flash-preview", "gemini-3.5-flash"];

export function ocrModelChain(): string[] {
  const [primary, ...rest] = geminiModelChain();
  return [...new Set([primary, ...OCR_EXTRA_MODELS, ...rest])];
}

export function ocrReaderConfigured(): boolean {
  return process.env.AI_PROVIDER?.trim().toLowerCase() === "gemini" && Boolean(process.env.GEMINI_API_KEY);
}

/** `deadlineAt` (epoch ms) is the latest moment this call may still be waiting on the AI: the caller's function has a hard time limit. */
export async function readPages(images: { page: number; png: Uint8Array }[], deadlineAt: number, firstModel = 0): Promise<{ pages: string[]; model: string }> {
  if (!ocrReaderConfigured()) throw new OcrReaderUnavailableError("The AI reader is not configured.");
  const { GoogleGenAI } = await import("@google/genai");
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY as string });
  const startPage = images[0].page;
  const parts = [
    { text: buildOcrPrompt(images.map((i) => i.page)) },
    ...images.map((i) => ({ inlineData: { mimeType: "image/png", data: Buffer.from(i.png).toString("base64") } })),
  ];
  let lastStatus: number | undefined;
  let sawQuota = false;
  let sawOther = false; // a model that failed for some reason other than quota (overload, timeout, unreadable answer)
  // Start each window on a different model so parallel windows spread across the models' per-minute limits instead of all hitting one.
  const chain = ocrModelChain();
  const ordered = chain.map((_, i) => chain[(firstModel + i) % chain.length]);
  // Gemini answers 500/503/504 ("high demand") for a while at a time, per model, and each model has its own daily allowance. One attempt
  // per model (a hung or overloaded model must not eat the whole call), then the next model; the caller tries again on its next call.
  // Never wait past the deadline.
  const RETRY_DELAY_MS = 1500;
  const MIN_ATTEMPT_MS = 6000;
  for (const model of ordered) {
    let thinkingOff = true;
    for (let attempt = 0; attempt < 1; attempt++) {
      const remaining = deadlineAt - Date.now();
      if (remaining < MIN_ATTEMPT_MS) break;
      try {
        const res = await ai.models.generateContent({
          model,
          contents: [{ role: "user", parts }],
          config: {
            temperature: 0,
            maxOutputTokens: 12_000,
            abortSignal: AbortSignal.timeout(Math.min(28_000, remaining - 1000)),
            // Reading text needs no reasoning; switching it off is faster and cheaper. Some models refuse that, so retry once without.
            ...(thinkingOff ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
          },
        });
        const pages = res.text ? parseOcrResponse(res.text, startPage, images.length) : null;
        if (pages) return { pages, model };
        sawOther = true;
        break; // answered, but not in the requested shape: try the next model
      } catch (err) {
        const status = (err as { status?: number } | null)?.status;
        const name = (err as Error | null)?.name;
        lastStatus = status;
        if (status === 429) {
          sawQuota = true;
          break; // quota is per model: go straight to the next one, never retry
        }
        if (status === 400 && thinkingOff) {
          thinkingOff = false; // this model may not allow thinking to be disabled
          attempt--;
          continue;
        }
        sawOther = true;
        const transient = status === 500 || status === 503 || status === 504 || name === "TimeoutError" || name === "AbortError";
        if (transient && attempt === 0 && deadlineAt - Date.now() > MIN_ATTEMPT_MS + RETRY_DELAY_MS) {
          await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
          continue;
        }
        break;
      }
    }
  }
  // eslint-disable-next-line no-console
  console.error("[ocr] reader failed", lastStatus ? { status: lastStatus } : {});
  // "Out of quota" only when quota was the whole story; a mixture of refusals and overload is just a busy moment worth retrying.
  const allQuota = sawQuota && !sawOther;
  throw new OcrReaderUnavailableError(allQuota ? "The AI reader is out of quota right now. Progress is saved; try again later." : "The AI reader is busy right now. Progress is saved; it will be tried again.", allQuota);
}
