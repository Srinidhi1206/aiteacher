// Provider-independent types for the AI Tutor. Nothing here references a
// specific vendor (Gemini/OpenAI/etc.) - see lib/ai/provider.ts for the
// per-vendor implementations behind this interface.
import "server-only";

export type AIRole = "user" | "assistant";

export interface AIChatMessage {
  role: AIRole;
  content: string;
}

// Data-minimized context assembled server-side - see lib/ai/context.ts.
// Deliberately excludes anything not needed to answer the question: no
// email, password, phone, school administrative data, or other students'
// information. See docs/ARCHITECTURE.md "AI Tutor" section for the exact
// data-minimization rules.
export interface AICurriculumContext {
  state?: string;
  board?: string;
  className?: string; // e.g. "Class 8"
  subject?: string;
  chapter?: string;
  topic?: string;
}

export interface AIPerformanceContext {
  masteryPct?: number;
  weakTopics?: string[]; // topic names only, bounded to a handful
  strengths?: string[]; // topic names only, bounded to a handful
}

export interface AIStudentContext {
  curriculum?: AICurriculumContext;
  performance?: AIPerformanceContext;
}

export interface AIGenerateRequest {
  systemPrompt: string;
  messages: AIChatMessage[]; // prior turns, oldest first
  userMessage: string;
  studentContext?: AIStudentContext;
  temperature?: number;
  maxOutputTokens?: number;
}

export interface AIGenerateResult {
  content: string;
}

export interface AIProvider {
  readonly name: string;
  generateResponse(request: AIGenerateRequest): Promise<AIGenerateResult>;
}
