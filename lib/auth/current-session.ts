// Reusable "who is making this request" helper for Server Actions and
// Route Handlers, so every new action doesn't re-implement cookie reading.
// This is the ONLY source of identity server actions should trust - never
// a client-supplied userId/teacherId/studentId/role in a request body.
import "server-only";
import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySession, type SessionPayload } from "./session";

export async function getCurrentSession(): Promise<SessionPayload | null> {
  const token = cookies().get(SESSION_COOKIE)?.value;
  return verifySession(token);
}

export class UnauthorizedError extends Error {
  constructor(message = "Not authenticated.") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends Error {
  constructor(message = "Not authorized to perform this action.") {
    super(message);
    this.name = "ForbiddenError";
  }
}

/** Throws UnauthorizedError if not logged in, ForbiddenError if the wrong role. */
export async function requireRole(role: SessionPayload["role"]): Promise<SessionPayload> {
  const session = await getCurrentSession();
  if (!session) throw new UnauthorizedError();
  if (session.role !== role) throw new ForbiddenError(`This action requires the ${role} role.`);
  return session;
}
