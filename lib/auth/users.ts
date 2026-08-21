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
// `npm run db:seed` (see prisma/seed.ts and docs/DEMO_CREDENTIALS.md) or
// eventually the Admin > Users UI (Stage C) - never hardcoded here.

import "server-only";
import { verifyPassword } from "./password";

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

export async function findUser(role: Role, username: string, password: string): Promise<AuthenticatedUser | null> {
  if (process.env.DATABASE_URL) {
    return findUserInDatabase(role, username, password);
  }
  return findUserInFallback(role, username, password);
}

async function findUserInDatabase(role: Role, username: string, password: string): Promise<AuthenticatedUser | null> {
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

  if (!dbUser || !dbUser.isActive || dbUser.role !== ROLE_TO_DB[role]) return null;

  const valid = await verifyPassword(password, dbUser.passwordHash);
  if (!valid) return null;

  const appRole = ROLE_FROM_DB[dbUser.role];
  if (!appRole) return null;

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

  return result;
}

// ---------------------------------------------------------------------------
// Fallback: used only when DATABASE_URL is unset (no database connected
// yet). Same 7 demo accounts documented in docs/DEMO_CREDENTIALS.md, with
// the same usernames/passwords the seeded database version will use, so
// nothing changes for anyone using these credentials once the database is
// connected - the app just starts authenticating them for real instead.
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

function findUserInFallback(role: Role, username: string, password: string): AuthenticatedUser | null {
  const match = FALLBACK_USERS.find(
    (u) => u.role === role && u.username.toLowerCase() === username.toLowerCase() && u.password === password
  );
  if (!match) return null;
  const { password: _password, ...rest } = match;
  return rest;
}
