// Hardcoded account directory for the initial rollout (7 users total).
// No database yet — this is intentional for the first deploy. When you wire
// up Prisma/Postgres (see docs/ARCHITECTURE.md), replace this file with a
// `User` table lookup and hash the passwords with bcrypt instead of storing
// them in plaintext here.
//
// IMPORTANT: change these passwords before you share the live link with
// anyone, and never commit real production passwords to git — move them to
// environment variables (see the ADMIN_PASSWORD-style pattern below) once
// you're ready to deploy. See docs/DEMO_CREDENTIALS.md for the full list.

export type Role = "admin" | "teacher" | "student";

export interface AppUser {
  id: string;
  username: string;
  password: string; // plaintext for now — see note above
  name: string;
  role: Role;
  /** Student-only: the class this student is enrolled in (Class 1-10). */
  class?: string;
  /** Teacher-only: classes this teacher currently teaches (foundation for future class-scoped views). */
  assignedClasses?: string[];
  /** Teacher-only: subjects this teacher currently teaches. */
  subjects?: string[];
}

export const USERS: AppUser[] = [
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

export function findUser(role: Role, username: string, password: string): AppUser | null {
  const match = USERS.find(
    (u) => u.role === role && u.username.toLowerCase() === username.toLowerCase() && u.password === password
  );
  return match ?? null;
}
