// Offline tests that PUBLIC REGISTRATION can never grant a privileged role or an active account: whatever the browser sends, a new student, teacher or administrator starts PENDING
// with exactly the role of the form they used, an administrator is never a super administrator, someone naming an EXISTING school is never attached to it, and weak or known
// passwords are refused. The real registration actions run against an in-memory database in PRODUCTION mode (the deployed configuration: administrators are not auto-approved).
// No real database, network or password hashing cost. Needs Node's module mocking (--experimental-test-module-mocks, as in `npm run test:storage`).
import { test, mock, before } from "node:test";
import assert from "node:assert/strict";

const here = (p: string) => new URL(`../${p}`, import.meta.url).href;
type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const D = {
  users: [] as Row[],
  students: [] as Row[],
  teachers: [] as Row[],
  admins: [] as Row[],
  requests: [] as Row[],
  schools: [{ id: "demo", name: "TeachAI Demo School", stateId: "ts", boardId: "bse", isEnabled: true }, { id: "cbse-school", name: "CBSE School", stateId: "ts", boardId: "cbse", isEnabled: true }] as Row[],
  audit: [] as Row[],
  notified: [] as Row[],
  seq: 0,
};
const BOARDS: Row = { bse: { id: "bse", shortName: "BSE Telangana", type: "STATE", stateId: "ts", isEnabled: true }, cbse: { id: "cbse", shortName: "CBSE", type: "NATIONAL", stateId: null, isEnabled: true }, off: { id: "off", shortName: "Off", type: "NATIONAL", stateId: null, isEnabled: false } };
const CLASSES: Row = { c10: { id: "c10", label: "Class 10", grade: 10, boardId: "bse", isEnabled: true }, c9cbse: { id: "c9cbse", label: "Class 9", grade: 9, boardId: "cbse", isEnabled: true } };

const tables = (d: typeof D) => ({
  user: {
    findUnique: async ({ where }: Row) => d.users.find((u) => (where.username ? u.username === where.username : u.email === where.email)) ?? null,
    create: async ({ data }: Row) => {
      const u = { id: `u${++d.seq}`, ...data };
      d.users.push(u);
      return u;
    },
  },
  board: { findUnique: async ({ where }: Row) => BOARDS[where.id] ?? null },
  schoolClass: { findUnique: async ({ where }: Row) => CLASSES[where.id] ?? null },
  school: {
    findUnique: async ({ where }: Row) => d.schools.find((s) => s.id === where.id) ?? null,
    findFirst: async ({ where }: Row) => d.schools.find((s) => s.boardId === where.boardId && s.stateId === where.stateId && s.name.toLowerCase() === where.name.equals.toLowerCase()) ?? null,
    create: async ({ data }: Row) => {
      const s = { id: `school${++d.seq}`, ...data };
      d.schools.push(s);
      return s;
    },
  },
  student: { create: async ({ data }: Row) => void d.students.push(data) },
  teacher: { create: async ({ data }: Row) => (d.teachers.push(data), { id: `t${++d.seq}`, ...data }), findMany: async () => [] },
  admin: { create: async ({ data }: Row) => void d.admins.push(data) },
  registrationRequest: { create: async ({ data }: Row) => void d.requests.push(data) },
  auditLog: { create: async ({ data }: Row) => void d.audit.push(data) },
  teacherAssignment: { createMany: async () => undefined },
  schoolClassSubject: { findMany: async () => [], findUnique: async ({ where }: Row) => (where.schoolClassId_subjectId.subjectId === "maths" ? { isEnabled: true } : null) },
});
const prisma = {
  ...tables(D),
  $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(tables(D)),
};

mock.module("server-only", { namedExports: {} });
mock.module(here("lib/prisma.ts"), { namedExports: { prisma } });
mock.module(here("lib/auth/password.ts"), { namedExports: { hashPassword: async (p: string) => `hash:${p.length}`, verifyPassword: async () => false } });
mock.module(here("lib/notifications/core.ts"), { namedExports: { notifyAdminsQuietly: async (_audience: unknown, content: Row) => void D.notified.push(content) } });

let reg: typeof import("@/lib/actions/registration");
const previousEnv = process.env.NODE_ENV;
before(async () => {
  (process.env as Record<string, string>).NODE_ENV = "production"; // read when the module loads: administrators are not auto-approved in production
  reg = await import("@/lib/actions/registration");
});
import { after } from "node:test";
after(() => {
  (process.env as Record<string, string | undefined>).NODE_ENV = previousEnv;
});

function reset() {
  for (const k of ["users", "students", "teachers", "admins", "requests", "audit", "notified"] as const) D[k].length = 0;
  D.schools.splice(2);
}
const base = (over: Row = {}) => ({ name: "Asha Rao", username: "asha.rao", email: "asha@example.com", password: "Sunrise2026", confirmPassword: "Sunrise2026", ...over });
const student = (over: Row = {}) => base({ stateId: "ts", boardId: "bse", schoolClassId: "c10", ...over });
const admin = (over: Row = {}) => base({ stateId: "ts", boardId: "bse", schoolName: "Brand New School", reason: "I will manage timetables and exams for my school.", ...over });

// ---- no privilege can be requested through the form ------------------------------------------------------------------------------------------------------------------

test("a student registration is always a PENDING STUDENT, whatever extra fields the browser sends (role, status, super administrator)", async () => {
  reset();
  const res = await reg.registerStudent(student({ role: "ADMIN", status: "ACTIVE", isSuperAdmin: true, requestedRole: "ADMIN" }));
  assert.equal(res.ok, true);
  assert.deepEqual([D.users[0].role, D.users[0].status], ["STUDENT", "PENDING"]);
  assert.equal(D.students.length, 1);
  assert.equal(D.admins.length, 0);
  assert.equal(D.requests[0].requestedRole, "STUDENT");
  assert.ok(!JSON.stringify(D.requests[0]).includes("isSuperAdmin"));
});

test("an administrator request is always a PENDING ADMIN who is never a super administrator, whatever the browser sends", async () => {
  reset();
  const res = await reg.registerAdminRequest(admin({ role: "STUDENT", status: "ACTIVE", isSuperAdmin: true }));
  assert.equal(res.ok, true);
  assert.deepEqual([D.users[0].role, D.users[0].status], ["ADMIN", "PENDING"], "in production nobody becomes an administrator without approval");
  assert.equal(D.admins[0].isSuperAdmin, false);
  assert.equal(D.requests[0].requestedRole, "ADMIN");
  assert.equal(D.notified.length, 1, "the super administrator is told");
});

test("a NEW school started by an applicant is created DISABLED in production, so an unverified applicant cannot squat a school name", async () => {
  reset();
  await reg.registerAdminRequest(admin());
  assert.equal(D.schools.at(-1)!.name, "Brand New School");
  assert.equal(D.schools.at(-1)!.isEnabled, false);
});

test("naming an EXISTING school never attaches the applicant to it: they stay school-less and pending until the super administrator approves the join", async () => {
  reset();
  const res = await reg.registerAdminRequest(admin({ schoolName: "teachai demo school" }));
  assert.equal(res.ok && res.data?.joinPending, true);
  assert.equal(D.admins[0].schoolId, null, "no school, so no access to its users, materials or results");
  assert.equal(D.requests[0].requestedDetails.joinSchoolId, "demo");
  assert.equal(D.schools.length, 2, "no duplicate school was created");
});

test("a teacher registration requests assignments but is PENDING and holds none", async () => {
  reset();
  const res = await reg.registerTeacher(base({ stateId: "ts", boardId: "bse", schoolId: "demo", requestedAssignments: [{ schoolClassId: "c10", subjectId: "maths" }] }));
  assert.equal(res.ok, true);
  assert.deepEqual([D.users[0].role, D.users[0].status], ["TEACHER", "PENDING"]);
});

// ---- validation --------------------------------------------------------------------------------------------------------------------------------------------------------

test("weak, mismatched or malformed credentials are refused: short, no digit, no letter, passwords that differ, a bad username, a bad email", async () => {
  reset();
  const bad: [string, Row][] = [
    ["short", { password: "Ab1", confirmPassword: "Ab1" }],
    ["no digit", { password: "OnlyLetters", confirmPassword: "OnlyLetters" }],
    ["no letter", { password: "12345678", confirmPassword: "12345678" }],
    ["different confirmation", { confirmPassword: "Sunrise2027" }],
    ["username with spaces", { username: "asha rao" }],
    ["username too short", { username: "ab" }],
    ["bad email", { email: "not-an-email" }],
    ["no name", { name: " " }],
  ];
  for (const [name, over] of bad) assert.equal((await reg.registerStudent(student(over))).ok, false, name);
  assert.equal(D.users.length, 0);
});

test("in production the publicly documented demo passwords (Admin@123, Teacher@123, Student@123, in any case) are refused at registration", async () => {
  reset();
  for (const known of ["Admin@123", "Teacher@123", "Student@123", "student@123", " STUDENT@123 "]) {
    const res = await reg.registerStudent(student({ password: known, confirmPassword: known }));
    assert.equal(res.ok, false, known);
  }
  assert.equal(D.users.length, 0);
});

test("a username or an email already in use is refused (and nothing is created)", async () => {
  reset();
  assert.equal((await reg.registerStudent(student())).ok, true);
  const sameUser = await reg.registerStudent(student({ email: "other@example.com" }));
  const sameMail = await reg.registerStudent(student({ username: "someone.else" }));
  assert.deepEqual([sameUser.ok, sameMail.ok], [false, false]);
  assert.equal(D.users.length, 1);
});

test("the board, class and school must make sense together: a disabled board, a class of another board, a school of another board are refused", async () => {
  reset();
  assert.equal((await reg.registerStudent(student({ boardId: "off" }))).ok, false);
  assert.equal((await reg.registerStudent(student({ schoolClassId: "c9cbse" }))).ok, false, "a CBSE class under the state board");
  assert.equal((await reg.registerStudent(student({ schoolId: "cbse-school" }))).ok, false, "a CBSE school for a state-board student");
  assert.equal((await reg.registerStudent(student({ schoolId: "no-such-school" }))).ok, false);
  assert.equal((await reg.registerStudent(student({ stateId: "other-state" }))).ok, false, "the state board does not belong to that state");
  assert.equal(D.users.length, 0);
});

test("a teacher cannot request a subject the class does not offer, or a class of another board", async () => {
  reset();
  const base2 = { stateId: "ts", boardId: "bse", schoolId: "demo" };
  assert.equal((await reg.registerTeacher(base({ ...base2, requestedAssignments: [{ schoolClassId: "c10", subjectId: "astrology" }] }))).ok, false);
  assert.equal((await reg.registerTeacher(base({ ...base2, requestedAssignments: [{ schoolClassId: "c9cbse", subjectId: "maths" }] }))).ok, false);
  assert.equal((await reg.registerTeacher(base({ ...base2, requestedAssignments: [] }))).ok, false, "at least one is needed");
  assert.equal(D.users.length, 0);
});
