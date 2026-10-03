"use server";

// Stage F: admin approval/suspension actions. Every mutation here:
//   - re-derives the actor from the session (never trusts client input for
//     who is acting),
//   - re-checks isSuperAdmin fresh from the database on every call (never
//     trusted from the session cookie, even though the cookie itself is
//     tamper-proof - a fresh check means a demoted/promoted admin's
//     permissions take effect immediately, not on next login), and
//   - enforces: only a super admin may approve/reject an ADMIN
//     registration request, or suspend/reactivate an ADMIN account; nobody
//     can suspend/reactivate the protected super admin at all; nobody can
//     set isSuperAdmin through any code path here (there is no parameter
//     for it).
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentSession, ForbiddenError, UnauthorizedError } from "@/lib/auth/current-session";
import type { ActionResult } from "./materials";
import { Role, Prisma } from "@prisma/client";
import { randomInt } from "node:crypto";
import { hashPassword } from "@/lib/auth/password";
import { validateCurriculumSelection, deriveGradeStage, deriveCurriculum } from "./registration";
import { isKnownDefaultPassword } from "@/lib/auth/known-defaults";

// Same rule as lib/actions/registration.ts's passwordField - duplicated,
// not imported, because a "use server" file may only export async
// functions, never a plain Zod schema value.
const PASSWORD_REGEX = /^(?=.*[A-Za-z])(?=.*\d).{8,}$/;
const passwordField = z
  .string()
  .min(8, "Password must be at least 8 characters.")
  .regex(PASSWORD_REGEX, "Password must include at least one letter and one number.")
  .refine((p) => process.env.NODE_ENV !== "production" || !isKnownDefaultPassword(p), "That password is too common. Choose a different one.");

interface AdminActor {
  userId: string;
  adminId: string;
  isSuperAdmin: boolean;
  // null for a global/platform-wide admin (the bootstrap super admin, and
  // any admin created before school-scoping existed) - unchanged behavior
  // for those. Non-null means this admin administers exactly one school;
  // callers use this to force-scope mutations to that school rather than
  // trusting a client-supplied schoolId.
  schoolId: string | null;
  schoolBoardId: string | null;
}

/** Confirms the caller is an admin and returns their fresh (not session-cached) isSuperAdmin/school status. */
export async function requireAdminActor(): Promise<AdminActor> {
  const session = await getCurrentSession();
  if (!session) throw new UnauthorizedError();
  if (session.role !== "admin") throw new ForbiddenError("Admin access required.");
  const admin = await prisma.admin.findUnique({ where: { userId: session.id }, include: { school: true } });
  if (!admin) throw new ForbiddenError("Admin profile not found.");
  return {
    userId: session.id,
    adminId: admin.id,
    isSuperAdmin: admin.isSuperAdmin,
    schoolId: admin.schoolId,
    schoolBoardId: admin.school?.boardId ?? null,
  };
}

function requireSuperAdmin(actor: AdminActor) {
  if (!actor.isSuperAdmin) {
    throw new ForbiddenError("Only the super administrator can perform this action.");
  }
}

// ---------------------------------------------------------------------------
// School boundary for user management
//
// A user's school lives on whichever role profile they have (Student /
// Teacher / Admin), not on User itself. Both sides of every comparison come
// from the database - the actor's school from their own Admin row
// (requireAdminActor) and the target's school from the target's profile -
// never from anything the browser sends.
//
// Rules:
//   - A super admin is platform-level and is not school-limited (unchanged).
//   - A normal admin may only manage users whose school is exactly their own.
//   - A normal admin with NO school can manage nobody: a school-less target
//     never equals "no school", so the boundary can't be bypassed by having
//     a null school on both sides.
// Callers must run this check BEFORE any mutation, and answer a failed check
// with the same "not found" they'd give for a missing record, so a foreign
// school's user or request isn't confirmed to exist.
// ---------------------------------------------------------------------------

type ProfileSchools = {
  student: { schoolId: string | null } | null;
  teacher: { schoolId: string | null } | null;
  admin: { schoolId: string | null } | null;
};

const profileSchoolSelect = {
  student: { select: { schoolId: true } },
  teacher: { select: { schoolId: true } },
  admin: { select: { schoolId: true } },
} as const;

function schoolOfUser(u: ProfileSchools): string | null {
  return u.student?.schoolId ?? u.teacher?.schoolId ?? u.admin?.schoolId ?? null;
}

function actorMayManageSchool(actor: AdminActor, targetSchoolId: string | null): boolean {
  if (actor.isSuperAdmin) return true;
  return actor.schoolId !== null && targetSchoolId === actor.schoolId;
}

// ---------------------------------------------------------------------------
// Registration approval
// ---------------------------------------------------------------------------

export async function listRegistrationRequests(filters?: { status?: "PENDING" | "APPROVED" | "REJECTED" }) {
  const actor = await requireAdminActor();
  // A normal admin only ever sees requests from their own school; a normal
  // admin with no school sees none. Super admin keeps the platform-wide view.
  if (!actor.isSuperAdmin && !actor.schoolId) return [];
  return prisma.registrationRequest.findMany({
    where: {
      status: filters?.status,
      ...(actor.isSuperAdmin
        ? {}
        : {
            user: {
              OR: [
                { student: { schoolId: actor.schoolId } },
                { teacher: { schoolId: actor.schoolId } },
                { admin: { schoolId: actor.schoolId } },
              ],
            },
          }),
    },
    // Never send credential hashes to the browser.
    include: { user: { omit: { passwordHash: true } }, reviewedBy: { omit: { passwordHash: true } } },
    orderBy: { submittedAt: "desc" },
  });
}

export async function approveRegistration(requestId: string): Promise<ActionResult> {
  try {
    const actor = await requireAdminActor();
    const request = await prisma.registrationRequest.findUnique({
      where: { id: requestId },
      include: { user: { omit: { passwordHash: true }, include: profileSchoolSelect } },
    });
    if (!request || !actorMayManageSchool(actor, schoolOfUser(request.user))) {
      return { ok: false, error: "Registration request not found." };
    }
    if (request.status !== "PENDING") return { ok: false, error: "This request has already been reviewed." };

    // Only a super admin may approve another admin - this is the one rule
    // that most directly prevents unauthorized admin creation.
    if (request.requestedRole === Role.ADMIN) requireSuperAdmin(actor);

    // An admin can never approve their own request - review must come
    // from a different account.
    if (request.userId === actor.userId) return { ok: false, error: "You cannot approve your own registration." };

    // Approving an ADMIN request is what actually grants school access (only a
    // super admin gets this far - see requireSuperAdmin above). Someone who
    // asked to join an existing school was registered school-less; the school
    // they named is applied here, from the server-stored request, never from
    // anything the browser sends now. A school created by a new applicant
    // (starts disabled in production) is enabled at the same moment.
    const adminGrantOps = [];
    if (request.requestedRole === Role.ADMIN) {
      const details = (request.requestedDetails ?? {}) as { joinSchoolId?: unknown };
      const joinSchoolId = typeof details.joinSchoolId === "string" ? details.joinSchoolId : null;
      const grantedSchoolId = joinSchoolId ?? request.user.admin?.schoolId ?? null;
      if (joinSchoolId) {
        adminGrantOps.push(prisma.admin.update({ where: { userId: request.userId }, data: { schoolId: joinSchoolId } }));
      }
      if (grantedSchoolId) {
        adminGrantOps.push(prisma.school.updateMany({ where: { id: grantedSchoolId, isEnabled: false }, data: { isEnabled: true } }));
      }
    }

    // A teacher's request names the class/subject pairs they teach. Approving is the review, so
    // the pairs that are still valid are applied now instead of the admin re-entering each one
    // in the Assignments dialog. Every pair is re-validated here against the school's own board
    // and the class's real subject list - the stored request is never trusted blindly.
    const teacherOps: Prisma.PrismaPromise<unknown>[] = [];
    let teacherApplied = 0;
    if (request.requestedRole === Role.TEACHER) {
      const teacher = await prisma.teacher.findUnique({ where: { userId: request.userId }, include: { school: { select: { boardId: true } } } });
      const details = (request.requestedDetails ?? {}) as { boardId?: unknown; requestedAssignments?: unknown };
      const requested = Array.isArray(details.requestedAssignments) ? (details.requestedAssignments as { schoolClassId?: unknown; subjectId?: unknown }[]) : [];
      const boardId = teacher?.school?.boardId ?? (typeof details.boardId === "string" ? details.boardId : null);
      if (teacher?.schoolId && boardId) {
        const seen = new Set<string>();
        for (const item of requested.slice(0, 30)) {
          if (typeof item.schoolClassId !== "string" || typeof item.subjectId !== "string") continue;
          const key = `${item.schoolClassId}:${item.subjectId}`;
          if (seen.has(key)) continue;
          seen.add(key);
          const cls = await prisma.schoolClass.findUnique({ where: { id: item.schoolClassId } });
          if (!cls || !cls.isEnabled || cls.boardId !== boardId) continue;
          const link = await prisma.schoolClassSubject.findUnique({ where: { schoolClassId_subjectId: { schoolClassId: item.schoolClassId, subjectId: item.subjectId } } });
          if (!link || !link.isEnabled) continue;
          teacherOps.push(
            prisma.teacherAssignment.upsert({
              where: { teacherId_schoolClassId_subjectId: { teacherId: teacher.id, schoolClassId: item.schoolClassId, subjectId: item.subjectId } },
              update: {},
              create: { teacherId: teacher.id, schoolClassId: item.schoolClassId, subjectId: item.subjectId },
            })
          );
          teacherApplied += 1;
        }
      }
    }

    await prisma.$transaction([
      prisma.user.update({ where: { id: request.userId }, data: { status: "ACTIVE" } }),
      ...adminGrantOps,
      ...teacherOps,
      prisma.registrationRequest.update({
        where: { id: requestId },
        data: { status: "APPROVED", reviewedAt: new Date(), reviewedByUserId: actor.userId },
      }),
      prisma.auditLog.create({
        data: {
          userId: actor.userId,
          action: "REGISTRATION_APPROVED",
          resource: `User:${request.userId}`,
          message: `Approved ${request.requestedRole} registration for "${request.user.username}"${request.requestedRole === Role.TEACHER ? ` (${teacherApplied} requested class/subject assignment${teacherApplied === 1 ? "" : "s"} applied)` : ""}`,
        },
      }),
    ]);
    return { ok: true };
  } catch (e) {
    if (e instanceof UnauthorizedError || e instanceof ForbiddenError) return { ok: false, error: e.message };
    throw e;
  }
}

export async function rejectRegistration(requestId: string, reason: string): Promise<ActionResult> {
  try {
    const actor = await requireAdminActor();
    const request = await prisma.registrationRequest.findUnique({
      where: { id: requestId },
      include: { user: { omit: { passwordHash: true }, include: profileSchoolSelect } },
    });
    if (!request || !actorMayManageSchool(actor, schoolOfUser(request.user))) {
      return { ok: false, error: "Registration request not found." };
    }
    if (request.status !== "PENDING") return { ok: false, error: "This request has already been reviewed." };
    if (request.requestedRole === Role.ADMIN) requireSuperAdmin(actor);
    if (request.userId === actor.userId) return { ok: false, error: "You cannot reject your own registration." };
    if (!reason.trim()) return { ok: false, error: "A rejection reason is required." };

    await prisma.$transaction([
      prisma.user.update({ where: { id: request.userId }, data: { status: "REJECTED" } }),
      prisma.registrationRequest.update({
        where: { id: requestId },
        data: { status: "REJECTED", reviewedAt: new Date(), reviewedByUserId: actor.userId, rejectionReason: reason },
      }),
      prisma.auditLog.create({
        data: {
          userId: actor.userId,
          action: "REGISTRATION_REJECTED",
          resource: `User:${request.userId}`,
          message: `Rejected ${request.requestedRole} registration for "${request.user.username}"`,
        },
      }),
    ]);
    return { ok: true };
  } catch (e) {
    if (e instanceof UnauthorizedError || e instanceof ForbiddenError) return { ok: false, error: e.message };
    throw e;
  }
}

// ---------------------------------------------------------------------------
// Suspend / reactivate already-active accounts
// ---------------------------------------------------------------------------

export async function suspendUser(userId: string): Promise<ActionResult> {
  try {
    const actor = await requireAdminActor();
    if (userId === actor.userId) return { ok: false, error: "You cannot suspend your own account." };

    const target = await prisma.user.findUnique({
      where: { id: userId },
      omit: { passwordHash: true },
      include: { admin: true, student: profileSchoolSelect.student, teacher: profileSchoolSelect.teacher },
    });
    // Same answer for "no such user" and "another school's user".
    if (!target || !actorMayManageSchool(actor, schoolOfUser(target))) return { ok: false, error: "User not found." };

    // The protected super admin can never be suspended through this
    // action, by anyone - that account's continuity is what makes the
    // rest of the approval chain recoverable if something goes wrong.
    if (target.admin?.isSuperAdmin) return { ok: false, error: "The super administrator account cannot be suspended." };
    if (target.role === Role.ADMIN) requireSuperAdmin(actor);

    await prisma.$transaction([
      prisma.user.update({ where: { id: userId }, data: { status: "SUSPENDED" } }),
      prisma.auditLog.create({
        data: {
          userId: actor.userId,
          action: "USER_SUSPENDED",
          resource: `User:${userId}`,
          message: `Suspended "${target.username}"`,
        },
      }),
    ]);
    return { ok: true };
  } catch (e) {
    if (e instanceof UnauthorizedError || e instanceof ForbiddenError) return { ok: false, error: e.message };
    throw e;
  }
}

export async function reactivateUser(userId: string): Promise<ActionResult> {
  try {
    const actor = await requireAdminActor();
    const target = await prisma.user.findUnique({
      where: { id: userId },
      omit: { passwordHash: true },
      include: { admin: true, student: profileSchoolSelect.student, teacher: profileSchoolSelect.teacher },
    });
    if (!target || !actorMayManageSchool(actor, schoolOfUser(target))) return { ok: false, error: "User not found." };
    if (target.role === Role.ADMIN) requireSuperAdmin(actor);

    await prisma.$transaction([
      prisma.user.update({ where: { id: userId }, data: { status: "ACTIVE" } }),
      prisma.auditLog.create({
        data: {
          userId: actor.userId,
          action: "USER_REACTIVATED",
          resource: `User:${userId}`,
          message: `Reactivated "${target.username}"`,
        },
      }),
    ]);
    return { ok: true };
  } catch (e) {
    if (e instanceof UnauthorizedError || e instanceof ForbiddenError) return { ok: false, error: e.message };
    throw e;
  }
}

// ---------------------------------------------------------------------------
// Password reset (admin-initiated)
//
// There is no self-service reset (no email flow exists), so a student or
// teacher who loses their password needs their school's admin to issue a new
// one. The new password is generated here on the server from a cryptographic
// RNG - never chosen by the browser - hashed with the same bcrypt helper
// used everywhere, and returned exactly once in this response, like the
// initial password createStudent shows. Only the hash is stored, so it can't
// be shown again. Scope is the same school boundary as every other user
// management action, checked before anything is written.
//
// Known limit: sessions are stateless signed cookies (see current-session.ts),
// so an already-signed-in browser stays signed in until its cookie expires.
// Suspending the account is what cuts access immediately.
// ---------------------------------------------------------------------------

// Letters and digits only, minus look-alikes (0/O, 1/l/I), so it can be read
// out or typed from a printout; always satisfies the "letter + number, 8+"
// rule that passwordField / the login form enforce.
const PW_LETTERS = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ";
const PW_DIGITS = "23456789";

function generatePassword(): string {
  const chars: string[] = [];
  for (let i = 0; i < 8; i++) chars.push(PW_LETTERS[randomInt(PW_LETTERS.length)]);
  for (let i = 0; i < 2; i++) chars.push(PW_DIGITS[randomInt(PW_DIGITS.length)]);
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

export async function resetUserPassword(userId: string): Promise<ActionResult<{ username: string; newPassword: string }>> {
  try {
    const actor = await requireAdminActor();
    if (userId === actor.userId) return { ok: false, error: "You can't reset your own password here." };

    const target = await prisma.user.findUnique({
      where: { id: userId },
      omit: { passwordHash: true },
      include: profileSchoolSelect,
    });
    // Same answer for "no such user" and "another school's user".
    if (!target || !actorMayManageSchool(actor, schoolOfUser(target))) return { ok: false, error: "User not found." };
    if (target.role !== Role.STUDENT && target.role !== Role.TEACHER) {
      return { ok: false, error: "Only student and teacher passwords can be reset here." };
    }
    if (target.status !== "ACTIVE") return { ok: false, error: "Only active accounts can have their password reset." };

    const newPassword = generatePassword();
    const passwordHash = await hashPassword(newPassword);
    await prisma.$transaction([
      prisma.user.update({ where: { id: userId }, data: { passwordHash } }),
      prisma.auditLog.create({
        data: {
          userId: actor.userId,
          action: "PASSWORD_RESET",
          resource: `User:${userId}`,
          message: `Reset password for "${target.username}"`,
        },
      }),
    ]);
    return { ok: true, data: { username: target.username, newPassword } };
  } catch (e) {
    if (e instanceof UnauthorizedError || e instanceof ForbiddenError) return { ok: false, error: e.message };
    throw e;
  }
}

// ---------------------------------------------------------------------------
// Assign (or move) an existing student to an existing school
//
// Registration is the only other place a student gets a school, and the field
// is optional there, so a student can legitimately end up with none - which
// hides every school-scoped item (materials, exams, schedules) from them. This
// is the platform super administrator's way to attach such a student to a real,
// already-existing school. It never creates a school, and it only ever changes
// Student.schoolId - class, board and state stay exactly as the student chose.
// ---------------------------------------------------------------------------

export async function assignStudentSchool(userId: string, schoolId: string): Promise<ActionResult> {
  try {
    const actor = await requireAdminActor();
    requireSuperAdmin(actor);

    const target = await prisma.user.findUnique({
      where: { id: userId },
      omit: { passwordHash: true },
      include: { student: { include: { school: true } } },
    });
    if (!target || target.role !== Role.STUDENT || !target.student) return { ok: false, error: "Student not found." };

    const school = await prisma.school.findUnique({ where: { id: schoolId } });
    if (!school) return { ok: false, error: "School not found." };
    if (!school.isEnabled) return { ok: false, error: "That school is disabled." };
    // A school with a board only teaches that board; attaching a student of another board would
    // leave them with a school whose content they could never see.
    if (school.boardId && target.student.boardId && school.boardId !== target.student.boardId) {
      return { ok: false, error: "This student's board does not match the school's board." };
    }
    if (target.student.schoolId === school.id) return { ok: false, error: "The student is already in this school." };

    const previous = target.student.school?.name ?? "no school";
    await prisma.$transaction([
      prisma.student.update({ where: { id: target.student.id }, data: { schoolId: school.id } }),
      prisma.auditLog.create({
        data: {
          userId: actor.userId,
          action: "USER_UPDATE",
          resource: `Student:${target.student.id}`,
          message: `School of "${target.username}" changed from ${previous} to "${school.name}"`,
        },
      }),
    ]);
    return { ok: true };
  } catch (e) {
    if (e instanceof UnauthorizedError || e instanceof ForbiddenError) return { ok: false, error: e.message };
    throw e;
  }
}

// ---------------------------------------------------------------------------
// UI convenience only - lets the client show/hide admin-only controls. This
// is NOT the authorization boundary; every mutation above re-checks
// isSuperAdmin itself regardless of what the client was told here.
// ---------------------------------------------------------------------------

export async function getMyAdminStatus(): Promise<{
  isSuperAdmin: boolean;
  schoolId: string | null;
  schoolName: string | null;
  schoolBoardId: string | null;
} | null> {
  try {
    const actor = await requireAdminActor();
    const school = actor.schoolId ? await prisma.school.findUnique({ where: { id: actor.schoolId } }) : null;
    return {
      isSuperAdmin: actor.isSuperAdmin,
      schoolId: actor.schoolId,
      schoolName: school?.name ?? null,
      schoolBoardId: actor.schoolBoardId,
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Listing (Admin > Users)
// ---------------------------------------------------------------------------

export async function listUsersForAdmin(filters?: { role?: Role; status?: "PENDING" | "ACTIVE" | "REJECTED" | "SUSPENDED" }) {
  const actor = await requireAdminActor();
  // A normal admin with no school can manage nobody, so shows nobody (the
  // super admin, who is platform-level, is unaffected).
  if (!actor.isSuperAdmin && !actor.schoolId) return [];
  return prisma.user.findMany({
    // The Users screen never needs - and must never receive - the bcrypt
    // hash, so it is stripped here, before the result is serialized to the
    // browser. (Login reads the hash through its own query in lib/auth.)
    omit: { passwordHash: true },
    where: {
      role: filters?.role,
      status: filters?.status,
      // A school-scoped admin only ever sees accounts belonging to their
      // own school (students/teachers enrolled there, or co-admins of the
      // same school) - never another school's. The super admin (no school)
      // keeps the platform-wide view, unchanged.
      ...(actor.schoolId
        ? {
            OR: [
              { student: { schoolId: actor.schoolId } },
              { teacher: { schoolId: actor.schoolId } },
              { admin: { schoolId: actor.schoolId } },
            ],
          }
        : {}),
    },
    include: {
      student: { include: { schoolClass: true, board: true, state: true, school: true } },
      teacher: { include: { school: true, assignments: { include: { schoolClass: true, subject: true } } } },
      admin: true,
      registrationRequest: true,
    },
    orderBy: { createdAt: "desc" },
  });
}

// ---------------------------------------------------------------------------
// Admin-initiated student creation - distinct from registerStudent
// (lib/actions/registration.ts), which is the student's own self-serve
// signup and always starts PENDING pending admin approval. An admin
// creating the account directly IS the approval - there is no one else who
// would review it - so this skips RegistrationRequest entirely and starts
// the account ACTIVE, matching how the seeded demo accounts already work.
// Reuses registerStudent's exact validation building blocks
// (validateCurriculumSelection, deriveGradeStage, deriveCurriculum,
// passwordField) rather than re-implementing them.
// ---------------------------------------------------------------------------

const createStudentSchema = z.object({
  name: z.string().trim().min(1, "Full name is required.").max(150),
  username: z
    .string()
    .trim()
    .toLowerCase()
    .min(3, "Username must be at least 3 characters.")
    .max(30)
    .regex(/^[a-z0-9._-]+$/, "Username can only contain letters, numbers, dots, underscores, and hyphens."),
  password: passwordField,
  boardId: z.string().min(1, "Board is required."),
  schoolClassId: z.string().min(1, "Class is required."),
  schoolId: z.string().optional(),
});

function isDuplicateAccountConstraintError(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
}

export async function createStudent(
  input: unknown
): Promise<ActionResult<{ userId: string; username: string; initialPassword: string }>> {
  try {
    const actor = await requireAdminActor();
    // A normal admin with no school has no school to create students in, and
    // must not be able to place students into an arbitrary school by sending
    // a schoolId - only the super admin (platform-level) may choose a school.
    if (!actor.isSuperAdmin && !actor.schoolId) {
      return { ok: false, error: "Your account isn't associated with a school, so it can't create students. Contact the super administrator." };
    }
    const parsed = createStudentSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
    const data = parsed.data;

    const existingUsername = await prisma.user.findUnique({ where: { username: data.username } });
    if (existingUsername) return { ok: false, error: "This username is already taken." };

    // A school-scoped admin (actor.schoolId set) can only ever create
    // students for their own school - the schoolId is derived from the
    // session-backed Admin row, never trusted from client input, the same
    // pattern already used for isSuperAdmin. A global admin (schoolId
    // null - the bootstrap super admin, or any admin predating this
    // feature) keeps the previous behavior of picking any school.
    const effectiveSchoolId = actor.schoolId ?? data.schoolId ?? null;
    // Likewise, if the admin's school already has a board assigned, every
    // student they create belongs to that board - overriding whatever
    // board the form happened to submit, rather than letting a
    // school-scoped admin enroll a student under a different board than
    // their own school teaches.
    const effectiveBoardId = actor.schoolBoardId ?? data.boardId;

    // Board is picked directly (no separate State selector in the admin
    // create-student form) - the board's own stateId is passed as the
    // "expected" state so validateCurriculumSelection's state-board check
    // is satisfied without trusting any client-supplied state value.
    const board = await prisma.board.findUnique({ where: { id: effectiveBoardId } });
    if (!board) return { ok: false, error: "Selected board is not available." };

    const curriculumCheck = await validateCurriculumSelection(board.stateId ?? undefined, effectiveBoardId, data.schoolClassId);
    if (!curriculumCheck.ok) return { ok: false, error: curriculumCheck.error };
    const { schoolClass } = curriculumCheck;

    if (effectiveSchoolId) {
      const school = await prisma.school.findUnique({ where: { id: effectiveSchoolId } });
      if (!school || !school.isEnabled) return { ok: false, error: "Selected school is not available." };
    }

    const passwordHash = await hashPassword(data.password);
    // No email field in the admin create-student form - synthesize a
    // unique, non-routable placeholder from the (already-verified-unique)
    // username, matching how the fallback demo accounts are addressed
    // (see prisma/seed.ts's studentN@teachai.local pattern).
    const email = `${data.username}@students.teachai.local`;

    try {
      const user = await prisma.$transaction(async (tx) => {
        const newUser = await tx.user.create({
          data: {
            username: data.username,
            email,
            passwordHash,
            name: data.name,
            role: Role.STUDENT,
            status: "ACTIVE",
          },
        });
        await tx.student.create({
          data: {
            userId: newUser.id,
            schoolId: effectiveSchoolId,
            boardId: effectiveBoardId,
            schoolClassId: data.schoolClassId,
            grade: schoolClass.label,
            gradeStage: await deriveGradeStage(schoolClass.grade),
            curriculum: await deriveCurriculum(board),
          },
        });
        await tx.auditLog.create({
          data: {
            userId: actor.userId,
            action: "USER_CREATE",
            resource: `User:${newUser.id}`,
            message: `Admin created student account "${data.username}" (${schoolClass.label}, ${board.shortName})`,
          },
        });
        return newUser;
      });

      // The plaintext password is returned exactly once, here, to the
      // authenticated admin who just set it - never persisted, never
      // logged, never retrievable again from any later query.
      return { ok: true, data: { userId: user.id, username: user.username, initialPassword: data.password } };
    } catch (e) {
      if (isDuplicateAccountConstraintError(e)) return { ok: false, error: "This username was just taken by another account. Please try again." };
      throw e;
    }
  } catch (e) {
    if (e instanceof UnauthorizedError || e instanceof ForbiddenError) return { ok: false, error: e.message };
    throw e;
  }
}
