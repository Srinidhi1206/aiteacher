// Provider selection + implementations, kept behind the AIProvider
// interface (lib/ai/types.ts) so nothing else in the app depends on a
// specific vendor. Server-only: never import this from a Client Component.
//
// Selection is entirely env-driven (AI_PROVIDER), so switching vendors -
// or adding a new one later (e.g. OpenAI) - never requires touching
// lib/actions/tutor.ts or any UI code, only adding a new branch here.
import "server-only";
import { getSocraticResponse } from "@/lib/socratic-engine";
import type { ChatMessage as MockChatMessage } from "@/lib/types";
import { AIError } from "./errors";
import type { AIChatMessage, AIGenerateRequest, AIGenerateResult, AIProvider, AIStudentContext } from "./types";

const DEFAULT_TEMPERATURE = 0.6;
// Thinking models count their reasoning tokens against this limit, so leave real headroom for the answer.
const DEFAULT_MAX_OUTPUT_TOKENS = 2048;
// A model call that never answers must not hold a student's chat open forever. Newer Gemini
// models can take 20-40s to answer under load, so one attempt gets 60s by default and the
// whole reply (attempts + retries) is capped at 100s - just under the chat's own 110s
// watchdog. Both are configurable: GEMINI_TIMEOUT_MS (per attempt), GEMINI_TOTAL_TIMEOUT_MS.
function envMs(name: string, fallback: number): number {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n >= 5_000 ? n : fallback;
}
const DEFAULT_GEMINI_MODEL = "gemini-flash-latest"; // "gemini-2.5-flash" has been retired by Google (404)
// Tried in this order after the configured/default model fails as unavailable. Override with GEMINI_FALLBACK_MODELS
// (comma-separated); set it to a single space-free "none" to disable the fallback.
const DEFAULT_FALLBACK_MODELS = ["gemini-3.6-flash", "gemini-2.5-flash"];

function geminiModelChain(): string[] {
  const primary = process.env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL;
  const raw = process.env.GEMINI_FALLBACK_MODELS?.trim();
  const fallbacks = raw === "none" ? [] : raw ? raw.split(",").map((m) => m.trim()).filter(Boolean) : DEFAULT_FALLBACK_MODELS;
  return [primary, ...fallbacks.filter((m) => m !== primary)];
}

/**
 * Renders the assembled student context (lib/ai/context.ts) into plain
 * instruction text appended to the system prompt. Deliberately terse and
 * numeric/label-only - see lib/ai/context.ts for what is and isn't
 * included.
 */
function formatContextBlock(context?: AIStudentContext): string {
  if (!context) return "";
  const lines: string[] = [];
  const c = context.curriculum;
  if (c && (c.state || c.board || c.className || c.subject || c.chapter || c.topic)) {
    const parts = [c.state, c.board, c.className, c.subject, c.chapter, c.topic].filter(Boolean);
    lines.push(`Student's curriculum context: ${parts.join(" > ")}.`);
  }
  const p = context.performance;
  if (p?.masteryPct !== undefined) {
    lines.push(`Mastery of the current topic: ${p.masteryPct}%.`);
  }
  if (p?.weakTopics?.length) {
    lines.push(`Other known weak topics for this student: ${p.weakTopics.join(", ")}.`);
  }
  if (p?.strengths?.length) {
    lines.push(`Other known strengths for this student: ${p.strengths.join(", ")}.`);
  }
  if (lines.length === 0) return "";
  return `\n\n---\nContext (for your reference only - do not just recite this back):\n${lines.join("\n")}`;
}

function toGeminiContents(messages: AIChatMessage[], userMessage: string) {
  return [
    ...messages.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] })),
    { role: "user", parts: [{ text: userMessage }] },
  ];
}

class GeminiProvider implements AIProvider {
  readonly name = "gemini";
  constructor(private readonly apiKey: string) {}

  async generateResponse(request: AIGenerateRequest): Promise<AIGenerateResult> {
    // Dynamically imported so the SDK is never loaded (or its absence
    // never matters) when Gemini isn't the active provider.
    const { GoogleGenAI } = await import("@google/genai");
    const ai = new GoogleGenAI({ apiKey: this.apiKey });

    const startedAt = Date.now();
    const perAttemptMs = envMs("GEMINI_TIMEOUT_MS", 60_000);
    const totalMs = envMs("GEMINI_TOTAL_TIMEOUT_MS", 100_000);
    // Optional: limit the model's hidden "thinking" for faster, cheaper tutor answers. Only sent when
    // set, because not every model accepts it (GEMINI_THINKING_BUDGET=0 turns thinking off where allowed).
    const thinkingBudgetRaw = process.env.GEMINI_THINKING_BUDGET;
    const thinkingBudget = thinkingBudgetRaw !== undefined && thinkingBudgetRaw.trim() !== "" && Number.isInteger(Number(thinkingBudgetRaw)) ? Number(thinkingBudgetRaw) : undefined;

    // The first model that answers wins. Google rejects individual models for hours at a time ("high demand" 503,
    // a retired name 404, or that model's own daily quota 429 - each model has its own bucket), so when the
    // preferred model fails like that the next one is tried straight away instead of failing the student's question.
    const models = geminiModelChain();

    try {
      const generate = (model: string) =>
        ai.models.generateContent({
          model,
          contents: toGeminiContents(request.messages, request.userMessage),
          config: {
            systemInstruction: request.systemPrompt + formatContextBlock(request.studentContext),
            temperature: request.temperature ?? DEFAULT_TEMPERATURE,
            maxOutputTokens: request.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
            ...(thinkingBudget !== undefined ? { thinkingConfig: { thinkingBudget } } : {}),
            abortSignal: AbortSignal.timeout(Math.max(5_000, Math.min(perAttemptMs, totalMs - (Date.now() - startedAt)))),
          },
        });
      // Gemini regularly answers 500/503/504 for a second or two under load; a few
      // short retries (backoff, at most two) turn most of those into a normal reply instead of an error.
      // Quota (429) and client errors are never retried - retrying a quota error only
      // burns more of the quota.
      let response;
      const RETRY_DELAYS_MS = [1500, 3500]; // up to two retries, only for transient server-side errors
      let modelIndex = 0;
      for (let attempt = 0; ; attempt++) {
        try {
          response = await generate(models[modelIndex]);
          break;
        } catch (transient) {
          const transientStatus = (transient as { status?: number } | null)?.status;
          // Another model is available and this one is overloaded, retired or out of its own quota: switch, no waiting.
          if (modelIndex < models.length - 1 && (transientStatus === 404 || transientStatus === 429 || transientStatus === 500 || transientStatus === 503 || transientStatus === 504)) {
            // eslint-disable-next-line no-console
            console.warn("[ai/provider] model unavailable, trying the next one", { status: transientStatus, model: models[modelIndex] });
            modelIndex++;
            attempt = -1; // the next model gets its own retries
            continue;
          }
          const retryable = transientStatus === 500 || transientStatus === 503 || transientStatus === 504;
          if (!retryable || attempt >= RETRY_DELAYS_MS.length) throw transient;
          // No point starting another attempt that cannot finish inside the overall cap.
          if (Date.now() - startedAt + RETRY_DELAYS_MS[attempt] > totalMs - 15_000) throw transient;
          await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS_MS[attempt]));
        }
      }

      const text = response.text;
      if (!text) throw new AIError("AI_PROVIDER_ERROR", "The AI tutor returned an empty response.");
      return { content: text };
    } catch (err) {
      if (err instanceof AIError) throw err;
      const status = (err as { status?: number } | null)?.status;
      // eslint-disable-next-line no-console
      console.error("[ai/provider] Gemini request failed", status ? { status } : { message: (err as Error)?.message });
      // The provider's own quota, not something the student did - say so, so they don't think they broke a rule.
      if (status === 429) throw new AIError("AI_RATE_LIMITED", "The AI tutor is very busy right now. Please try again in a minute.");
      const timedOut = (err as { name?: string } | null)?.name === "TimeoutError" || (err as { name?: string } | null)?.name === "AbortError";
      if (timedOut) throw new AIError("AI_PROVIDER_ERROR", "The AI tutor took too long to answer. Please try again.");
      throw new AIError("AI_PROVIDER_ERROR");
    }
  }
}

/**
 * Development-only canned responder, reusing the existing Socratic engine
 * (lib/socratic-engine.ts) that already backed the mock /ai-tutor page.
 * Opt-in only (AI_PROVIDER=mock) and explicitly refused in production - see
 * getAIProvider below - so a missing real key can never silently serve
 * fake responses in a deployed environment.
 */
class MockProvider implements AIProvider {
  readonly name = "mock";

  async generateResponse(request: AIGenerateRequest): Promise<AIGenerateResult> {
    const history: MockChatMessage[] = request.messages.map((m, i) => ({
      id: `mock-${i}`,
      role: m.role === "assistant" ? "ai" : "student",
      content: m.content,
      time: "",
    }));
    return { content: getSocraticResponse(request.userMessage, history) };
  }
}

/**
 * Resolves the active provider from environment configuration. Returns
 * null (never throws) when no provider is configured - callers must treat
 * null as "AI Tutor is not configured yet" (AIError "AI_NOT_CONFIGURED"),
 * not as a code path to work around. Nothing here runs at module load
 * time, so a missing key never affects `next build`.
 */
export function getAIProvider(): AIProvider | null {
  const providerName = process.env.AI_PROVIDER?.trim().toLowerCase();
  if (!providerName) return null;

  if (providerName === "mock") {
    if (process.env.NODE_ENV === "production") {
      // eslint-disable-next-line no-console
      console.error("[ai/provider] AI_PROVIDER=mock is not permitted in production; treating AI Tutor as not configured.");
      return null;
    }
    return new MockProvider();
  }

  if (providerName === "gemini") {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return null;
    return new GeminiProvider(apiKey);
  }

  // "openai" (and anything else) is reserved for a later stage - the
  // AIProvider interface already supports adding it without touching any
  // caller, but no implementation exists yet, so treat it the same as
  // unconfigured rather than guessing at an API shape.
  return null;
}
