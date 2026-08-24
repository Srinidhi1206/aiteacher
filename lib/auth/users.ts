// User lookup for login. Stage B (real authentication) added a real,
// database-backed path; it is used automatically whenever DATABASE_URL is
// configured. Until then - which is the current state of both local dev
// and the live Vercel deployment, since no database has been connected yet
// - this deliberately falls back to a small hardcoded account list so the
// app keeps working exactly as it does today.
//
// IMPORTANT: this fallback only activates when DATABASE_URL is completely
// unset. If DATABASE_URL IS set but a query fails for some other reason
// (bad credentials, network blip), that error is allowed to propagate as a
// failed login rather than silently falling back to demo credentials -
// silently accepting demo passwords in a "configured" production database
// would be a real security hole.
//
// Real accounts, once the database is connected, are created via
// `npm run db:seed` (see prisma/seed.ts and docs/DEMO_CREDENTIALS.md), the
// Stage F registration flow (pending admin approval), or eventually a full
// Admin > Users UI - never hardcoded here.
//
// Stage F: the fallback accounts below are dev/demo-only and have no
// concept of AccountStatus - they are always treated as ACTIVE. Real,
// database-backed accounts are gated on `User.status` (see
// findUserInDatabase below) - a PENDING/REJECTED/SUSPENDED account can
// never reach a signed-in session, regardless of a correct password.
//
// Stage I: the fallback path above is now also gated on NODE_ENV. Without
// this, a production deployment that simply forgot to set DATABASE_URL
// would silently authenticate against the well-known demo credentials
// documented in docs/DEMO_CREDENTIALS.md - a real account-takeover risk.
// Development/test keep working exactly as before; production with no
// DATABASE_URL now fails closed via AuthConfigurationError instead.

import "server-only";
import { verifyPassword } from "./password";

/**
 * Thrown when login can't proceed due to missing/invalid server
 * configuration (not a wrong password, not an account-status block).
 * Callers (see app/api/auth/login/route.ts) must never translate this into
 * "invalid credentials" - doing so would hide a real deployment
 * misconfiguration behind a misleading, seemingly-normal login failure.
 */
export class AuthConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthConfigurationError";
  }
}

export type Role = "admin" | "teacher" | "student";

export interface AuthenticatedUser {
  id: string;
  username: string;
  name: string;
  role: Role;
  /** Student-only: the class this student is enrolled in (Class 1-10). */
  class?: string;
  /** Teacher-only: classes this teacher currently teaches. */
  assignedClasses?: string[];
  /** Teacher-only: subjects this teacher currently teaches. */
  subjects?: string[];
}

export type NonActiveStatus = "PENDING" | "REJECTED" | "SUSPENDED";

/**
 * Discriminated login result. Kept distinct from a plain `User | null` so
 * the login route can tell "wrong username/password" apart from "correct
 * password, but this account isn't allowed to sign in yet" - those need
 * different messages (see STEP 9 of the Stage F spec), and conflating them
 * either leaks account existence (bad) or hides *why* a legitimate user
 * can't log in (bad UX, and against the spec's explicit requirement).
 */
export type LoginOutcome =
  | { kind: "success"; user: AuthenticatedUser }
  | { kind: "invalid_credentials" }
  | { kind: "account_status"; status: NonActiveStatus };

// Maps the app's lowercase Role (used throughout middleware.ts, the
// sidebar, session payloads, etc.) to/from Prisma's uppercase Role enum,
// so the rest of the app never has to deal with the DB's casing.
const ROLE_TO_DB: Record<Role, "ADMIN" | "TEACHER" | "STUDENT"> = {
  admin: "ADMIN",
  teacher: "TEACHER",
  student: "STUDENT",
};

const ROLE_FROM_DB: Record<string, Role> = {
  ADMIN: "admin",
  TEACHER: "teacher",
  STUDENT: "student",
};

export async function findUser(role: Role, username: string, password: string): Promise<LoginOutcome> {
  if (process.env.DATABASE_URL) {
    return findUserInDatabase(role, username, password);
  }
  if (process.env.NODE_ENV === "production") {
    throw new AuthConfigurationError(
      "DATABASE_URL is not configured. Refusing to authenticate against demo accounts in production - set DATABASE_URL to a real database."
    );
  }
  return findUserInFallback(role, username, password);
}

async function findUserInDatabase(role: Role, username: string, password: string): Promise<LoginOutcome> {
  // Dynamic import so `@prisma/client`/`lib/prisma` are never pulled into
  // the fallback-only path's module graph when there's no database.
  const { prisma } = await import("@/lib/prisma");

  const dbUser = await prisma.user.findUnique({
    where: { username: username.toLowerCase() },
    include: {
      student: { include: { schoolClass: true } },
      teacher: { include: { assignments: { include: { schoolClass: true, subject: true } } } },
    },
  });

  // Wrong username, or a real username but for a different role: treat
  // both as plain invalid credentials rather than a role-specific message,
  // so a login attempt can't be used to probe which role a username has.
  if (!dbUser || dbUser.role !== ROLE_TO_DB[role]) return { kind: "invalid_credentials" };

  // Check the password BEFORE revealing account status - otherwise an
  // attacker who doesn't know the password could still learn "this
  // account is pending/suspended" just by guessing usernames.
  const valid = await verifyPassword(password, dbUser.passwordHash);
  if (!valid) return { kind: "invalid_credentials" };

  if (dbUser.status !== "ACTIVE") {
    return { kind: "account_status", status: dbUser.status as NonActiveStatus };
  }

  const appRole = ROLE_FROM_DB[dbUser.role];
  if (!appRole) return { kind: "invalid_credentials" };

  const result: AuthenticatedUser = {
    id: dbUser.id,
    username: dbUser.username,
    name: dbUser.name,
    role: appRole,
  };

  if (dbUser.student) {
    result.class = dbUser.student.schoolClass?.label ?? undefined;
  }
  if (dbUser.teacher) {
    const assignments = dbUser.teacher.assignments;
    result.assignedClasses = [...new Set(assignments.map((a) => a.schoolClass.label))];
    result.subjects = [...new Set(assignments.map((a) => a.subject.name))];
  }

  return { kind: "success", user: result };
}

// ---------------------------------------------------------------------------
// Fallback: used only when DATABASE_URL is unset (no database connected
// yet). Same 7 demo accounts documented in docs/DEMO_CREDENTIALS.md, with
// the same usernames/passwords the seeded database version will use, so
// nothing changes for anyone using these credentials once the database is
// connected - the app just starts authenticating them for real instead.
//
// These are fixed, hardcoded DEVELOPMENT accounts, not a substitute for
// real registration - Stage F's registration/approval flow only exists on
// the database-backed path above. Do not add more accounts here; new real
// users are created via registration once a database is connected.
// ---------------------------------------------------------------------------

interface FallbackUser {
  id: string;
  username: string;
  password: string; // plaintext - fallback-only, never used once a database is connected
  name: string;
  role: Role;
  class?: string;
  assignedClasses?: string[];
  subjects?: string[];
}

const FALLBACK_USERS: FallbackUser[] = [
  {
    id: "admin-1",
    username: "admin",
    password: process.env.ADMIN_PASSWORD || "Admin@123",
    name: "Srinidhi",
    role: "admin",
  },
  {
    id: "teacher-1",
    username: "teacher",
    password: process.env.TEACHER_PASSWORD || "Teacher@123",
    name: "Teacher",
    role: "teacher",
    assignedClasses: ["Class 8", "Class 9", "Class 10"],
    subjects: ["Mathematics", "Science"],
  },
  {
    id: "student-1",
    username: "student1",
    password: process.env.STUDENT1_PASSWORD || "Student@123",
    name: "Student 1",
    role: "student",
    class: "Class 6",
  },
  {
    id: "student-2",
    username: "student2",
    password: process.env.STUDENT2_PASSWORD || "Student@123",
    name: "Student 2",
    role: "student",
    class: "Class 7",
  },
  {
    id: "student-3",
    username: "student3",
    password: process.env.STUDENT3_PASSWORD || "Student@123",
    name: "Student 3",
    role: "student",
    class: "Class 8",
  },
  {
    id: "student-4",
    username: "student4",
    password: process.env.STUDENT4_PASSWORD || "Student@123",
    name: "Student 4",
    role: "student",
    class: "Class 9",
  },
  {
    id: "student-5",
    username: "student5",
    password: process.env.STUDENT5_PASSWORD || "Student@123",
    name: "Student 5",
    role: "student",
    class: "Class 10",
  },
];

function findUserInFallback(role: Role, username: string, password: string): LoginOutcome {
  const match = FALLBACK_USERS.find(
    (u) => u.role === role && u.username.toLowerCase() === username.toLowerCase() && u.password === password
  );
  if (!match) return { kind: "invalid_credentials" };
  const { password: _password, ...rest } = match;
  return { kind: "success", user: rest };
}
