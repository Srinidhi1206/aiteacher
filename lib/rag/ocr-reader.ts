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

export function ocrReaderConfigured(): boolean {
  return process.env.AI_PROVIDER?.trim().toLowerCase() === "gemini" && Boolean(process.env.GEMINI_API_KEY);
}

export async function readPages(images: { page: number; png: Uint8Array }[]): Promise<{ pages: string[]; model: string }> {
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
  const RETRY_DELAYS_MS = [1500, 3500]; // Gemini answers 500/503/504 for a second or two under load; a short retry usually clears it
  for (const model of geminiModelChain()) {
    let thinkingOff = true;
    for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
      try {
        const res = await ai.models.generateContent({
          model,
          contents: [{ role: "user", parts }],
          config: {
            temperature: 0,
            maxOutputTokens: 16_000,
            abortSignal: AbortSignal.timeout(40_000),
            // Reading text needs no reasoning; switching it off is faster and cheaper. Some models refuse that, so retry once without.
            ...(thinkingOff ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
          },
        });
        const pages = res.text ? parseOcrResponse(res.text, startPage, images.length) : null;
        if (pages) return { pages, model };
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
          continue;
        }
        const transient = status === 500 || status === 503 || status === 504 || name === "TimeoutError" || name === "AbortError";
        if (transient && attempt < RETRY_DELAYS_MS.length) {
          await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt]));
          continue;
        }
        break;
      }
    }
  }
  // eslint-disable-next-line no-console
  console.error("[ocr] reader failed", lastStatus ? { status: lastStatus } : {});
  throw new OcrReaderUnavailableError(sawQuota ? "The AI reader is out of quota right now. Progress is saved; try again later." : "The AI reader could not read these pages right now.", sawQuota);
}
