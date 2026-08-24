// Reusable "who is making this request" helper for Server Actions and
// Route Handlers, so every new action doesn't re-implement cookie reading.
// This is the ONLY source of identity server actions should trust - never
// a client-supplied userId/teacherId/studentId/role in a request body.
import "server-only";
import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySession, type SessionPayload } from "./session";

// Stage K: closes a real "stale session" gap. A signed session cookie is
// valid for 7 days regardless of what happens to the account afterward -
// verifySession() only checks the HMAC signature, never the account's
// current AccountStatus. Without this re-check, an admin suspending or
// rejecting a user (or Stage F changing their role) would have no effect
// on that user's already-issued cookie until it naturally expired or they
// logged out - suspension would be cosmetic. Every real data-touching
// server action ultimately calls getCurrentSession() (directly or via
// requireRole()), so re-verifying here is the single choke point that
// covers all of them, without adding a database round trip to
// middleware.ts (which runs on the Edge runtime and cannot import Prisma
// in this project's configuration - see docs/DATABASE.md).
export async function getCurrentSession(): Promise<SessionPayload | null> {
  const token = cookies().get(SESSION_COOKIE)?.value;
  const session = await verifySession(token);
  if (!session) return null;

  // Only the database-backed path has a real User row to re-check. The
  // fallback/demo accounts (DATABASE_URL unset) have no AccountStatus
  // concept and are intentionally unaffected - see lib/auth/users.ts.
  if (process.env.DATABASE_URL) {
    // Dynamic import so lib/prisma.ts is never pulled into a module graph
    // that might run without a database - same reasoning as
    // findUserInDatabase in lib/auth/users.ts.
    const { prisma } = await import("@/lib/prisma");
    const dbUser = await prisma.user.findUnique({ where: { id: session.id }, select: { status: true } });
    if (!dbUser || dbUser.status !== "ACTIVE") return null;
  }

  return session;
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
