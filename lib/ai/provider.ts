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
const DEFAULT_MAX_OUTPUT_TOKENS = 1024;
const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";

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

    try {
      const response = await ai.models.generateContent({
        model: process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL,
        contents: toGeminiContents(request.messages, request.userMessage),
        config: {
          systemInstruction: request.systemPrompt + formatContextBlock(request.studentContext),
          temperature: request.temperature ?? DEFAULT_TEMPERATURE,
          maxOutputTokens: request.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
        },
      });

      const text = response.text;
      if (!text) throw new AIError("AI_PROVIDER_ERROR", "The AI tutor returned an empty response.");
      return { content: text };
    } catch (err) {
      if (err instanceof AIError) throw err;
      const status = (err as { status?: number } | null)?.status;
      // eslint-disable-next-line no-console
      console.error("[ai/provider] Gemini request failed", status ? { status } : { message: (err as Error)?.message });
      if (status === 429) throw new AIError("AI_RATE_LIMITED");
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
