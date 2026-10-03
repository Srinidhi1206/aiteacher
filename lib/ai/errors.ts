// Typed errors for the AI Tutor subsystem. Server actions catch these and
// map them to safe, generic messages for the client - the raw provider
// error (which can contain request/response detail we don't want to leak)
// never reaches the browser. See lib/actions/tutor.ts.
export type AIErrorCode =
  | "AI_NOT_CONFIGURED"
  | "AI_PROVIDER_ERROR"
  | "AI_RATE_LIMITED"
  | "AI_INVALID_REQUEST"
  | "AI_CONTEXT_ERROR"
  | "UNAUTHORIZED"
  | "CONVERSATION_NOT_FOUND";

const DEFAULT_MESSAGES: Record<AIErrorCode, string> = {
  AI_NOT_CONFIGURED: "The AI Tutor isn't available right now. Please try again later or ask your teacher.",
  AI_PROVIDER_ERROR: "The AI tutor couldn't generate a response right now. Please try again.",
  AI_RATE_LIMITED: "You're sending messages a little too fast. Please wait a moment and try again.",
  AI_INVALID_REQUEST: "That message couldn't be sent.",
  AI_CONTEXT_ERROR: "Couldn't load your curriculum context. Please try again.",
  UNAUTHORIZED: "You must be signed in as a student to use the AI Tutor.",
  CONVERSATION_NOT_FOUND: "That conversation doesn't exist.",
};

export class AIError extends Error {
  code: AIErrorCode;

  constructor(code: AIErrorCode, message?: string) {
    super(message ?? DEFAULT_MESSAGES[code]);
    this.code = code;
    this.name = "AIError";
  }
}
