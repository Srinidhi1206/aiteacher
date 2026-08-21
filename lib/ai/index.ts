import "server-only";

export { getAIProvider } from "./provider";
export { AIError } from "./errors";
export type { AIErrorCode } from "./errors";
export { getPromptTemplate, interpolate, TUTOR_PROMPT_NAMES } from "./prompts";
export type { TutorPromptName } from "./prompts";
export { buildStudentContext, resolveTopicContext, getStudentPerformanceContext } from "./context";
export type {
  AIProvider,
  AIChatMessage,
  AIGenerateRequest,
  AIGenerateResult,
  AIStudentContext,
  AICurriculumContext,
  AIPerformanceContext,
  AIRole,
} from "./types";
