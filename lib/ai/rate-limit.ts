// Minimal application-level abuse protection for the AI Tutor.
//
// LIMITATION (documented, not hidden): this is an in-memory, per-process
// counter. It resets on every server restart/deploy and does NOT
// coordinate across multiple server instances (e.g. several serverless
// function instances, or a multi-replica deployment) - a determined user
// spread across instances could exceed the intended limit. There is no
// Redis/shared store in this project yet (see docs/STEP_3_5.md Stage G).
// The function signature below is deliberately the only integration point
// this module exposes, so swapping the body for a Redis-backed (or other
// shared) limiter later doesn't require touching any caller.
import "server-only";
import { AIError } from "./errors";

const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 12;

const requestLog = new Map<string, number[]>();

export function checkTutorRateLimit(studentId: string): void {
  const now = Date.now();
  const recent = (requestLog.get(studentId) ?? []).filter((t) => now - t < WINDOW_MS);

  if (recent.length >= MAX_REQUESTS_PER_WINDOW) {
    throw new AIError("AI_RATE_LIMITED");
  }

  recent.push(now);
  requestLog.set(studentId, recent);
}
