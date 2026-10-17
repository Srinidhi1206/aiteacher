// Turns the student context (lib/ai/context.ts) into the background block appended to the tutor's system prompt. Pure and free of server-only code, so it is tested on its own.
import type { AIStudentContext } from "./types";

/**
 * Renders the assembled student context (lib/ai/context.ts) into plain
 * instruction text appended to the system prompt. Deliberately terse and
 * numeric/label-only - see lib/ai/context.ts for what is and isn't
 * included.
 */
export function formatContextBlock(context?: AIStudentContext): string {
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
  return `\n\n---\nContext (background for your reference - use it only where it helps with the question asked, do not recite it back, and do not bring it into an answer about something else):\n${lines.join("\n")}`;
}
