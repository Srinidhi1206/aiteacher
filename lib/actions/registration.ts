"use server";

// Stage F: student/teacher/admin-request registration. Every path here:
//   1. validates server-side (never trusts the client for role or status),
//   2. hashes the password (bcrypt, lib/auth/password.ts),
//   3. checks for duplicate username/email,
//   4. validates the selected State -> Board -> Class relationship against
//      the real database rows (never trusts a client-supplied combination),
//   5. creates the User with status = PENDING (never ACTIVE - only an
//      admin approval action can activate an account),
//   6. creates a RegistrationRequest row,
//   7. writes an AuditLog entry.
// Nothing here ever accepts `role` or `isSuperAdmin` as client input for
// the admin-request path - the server hardcodes both.
import { notifyAdminsQuietly } from "@/lib/notifications/core";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth/password";
import type { ActionResult } from "./materials";
import { GradeStage, Curriculum, Role, BoardType, Prisma } from "@prisma/client";
import { isKnownDefaultPassword } from "@/lib/auth/known-defaults";

// Stage K: assertNoDuplicateAccount below is a check-then-create pattern,
// not atomic - two concurrent registrations with the same username/email
// could both pass that check before either row is created. The database's
// own @unique constraints (User.username/email) still prevent an actual
// duplicate row from ever existing, but without this, the *second*
// concurrent request would surface as a raw, unhandled 500 instead of the
// same friendly "already taken" message the earlier check already
// produces for the (far more common) non-racing case. This is the safety
// net for that narrow race window, not the primary defense.
function isDuplicateAccountConstraintError(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
}
const DUPLICATE_ACCOUNT_RACE_MESSAGE = "That username or email was just taken by another registration. Please try again with different details.";

// Shared across all three registration forms. Not exported: a "use server"
// file may only export async functions, never a plain value like a Zod
// schema (see lib/actions/user-management.ts's createStudent, which
// declares an identical passwordField locally rather than importing one).
const PASSWORD_REGEX = /^(?=.*[A-Za-z])(?=.*\d).{8,}$/; // >=8 chars, at least one letter and one digit
const passwordField = z
  .string()
  .min(8, "Password must be at least 8 characters.")
  .regex(PASSWORD_REGEX, "Password must include at least one letter and one number.")
  .refine((p) => process.env.NODE_ENV !== "production" || !isKnownDefaultPassword(p), "That password is too common. Choose a different one.");

const baseAccountSchema = z.object({
  name: z.string().trim().min(1, "Full name is required.").max(150),
  username: z
    .string()
    .trim()
    .toLowerCase()
    .min(3, "Username must be at least 3 characters.")
    .max(30)
    .regex(/^[a-z0-9._-]+$/, "Username can only contain letters, numbers, dots, underscores, and hyphens."),
  email: z.string().trim().toLowerCase().email("Enter a valid email address."),
  password: passwordField,
  confirmPassword: z.string(),
  phone: z.string().trim().max(20).optional(),
});

function passwordsMatch<T extends { password: string; confirmPassword: string }>(data: T, ctx: z.RefinementCtx) {
  if (data.password !== data.confirmPassword) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Passwords do not match.", path: ["confirmPassword"] });
  }
}

async function assertNoDuplicateAccount(username: string, email: string): Promise<string | null> {
  const [byUsername, byEmail] = await Promise.all([
    prisma.user.findUnique({ where: { username } }),
    prisma.user.findUnique({ where: { email } }),
  ]);
  if (byUsername) return "This username is already taken.";
  if (byEmail) return "An account with this email already exists.";
  return null;
}

// async only because every top-level export of a "use server" file must be
// async (Next.js's server-actions compiler requirement) - neither function
// actually awaits anything.
export async function deriveGradeStage(grade: number): Promise<GradeStage> {
  if (grade <= 5) return GradeStage.PRIMARY;
  if (grade <= 8) return GradeStage.MIDDLE_SCHOOL;
  return GradeStage.HIGH_SCHOOL;
}

export async function deriveCurriculum(board: { shortName: string; type: BoardType }): Promise<Curriculum> {
  if (board.shortName === "CBSE") return Curriculum.CBSE;
  if (board.shortName === "CISCE") return Curriculum.ICSE;
  return Curriculum.STATE_BOARD;
}

/** Confirms the client-selected board/class actually form a real, currently-enabled combination - never trusts the IDs blindly. */
export async function validateCurriculumSelection(stateId: string | undefined, boardId: string, schoolClassId: string) {
  const board = await prisma.board.findUnique({ where: { id: boardId } });
  if (!board || !board.isEnabled) return { ok: false as const, error: "Selected board is not available." };
  if (board.type === "STATE" && board.stateId !== stateId) {
    return { ok: false as const, error: "Selected board does not belong to the selected state." };
  }

  const schoolClass = await prisma.schoolClass.findUnique({ where: { id: schoolClassId } });
  if (!schoolClass || !schoolClass.isEnabled || schoolClass.boardId !== boardId) {
    return { ok: false as const, error: "Selected class is not available for the selected board." };
  }

  return { ok: true as const, board, schoolClass };
}

// ---------------------------------------------------------------------------
// Student registration
// ---------------------------------------------------------------------------

const studentRegistrationSchema = baseAccountSchema
  .extend({
    dateOfBirth: z.string().optional(),
    stateId: z.string().min(1, "State is required."),
    boardId: z.string().min(1, "Board is required."),
    schoolClassId: z.string().min(1, "Class is required."),
    schoolId: z.string().optional(),
    guardianName: z.string().trim().max(150).optional(),
    guardianPhone: z.string().trim().max(20).optional(),
  })
  .superRefine(passwordsMatch);

export async function registerStudent(input: unknown): Promise<ActionResult<{ userId: string }>> {
  const parsed = studentRegistrationSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  const data = parsed.data;

  const dup = await assertNoDuplicateAccount(data.username, data.email);
  if (dup) return { ok: false, error: dup };

  const curriculumCheck = await validateCurriculumSelection(data.stateId, data.boardId, data.schoolClassId);
  if (!curriculumCheck.ok) return { ok: false, error: curriculumCheck.error };
  const { board, schoolClass } = curriculumCheck;

  if (data.schoolId) {
    const school = await prisma.school.findUnique({ where: { id: data.schoolId } });
    if (!school || !school.isEnabled) return { ok: false, error: "Selected school is not available." };
    // The chosen school is a request the administrator confirms at approval, but it must at least be coherent:
    // a school that teaches another board or sits in another state can never serve this student's content.
    if (school.boardId && school.boardId !== board.id) return { ok: false, error: "That school teaches a different board. Choose a school for your board, or leave the school blank." };
    if (school.stateId && data.stateId && school.stateId !== data.stateId) return { ok: false, error: "That school is in a different state." };
  }

  const passwordHash = await hashPassword(data.password);

  try {
    const user = await prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: {
          username: data.username,
          email: data.email,
          passwordHash,
          name: data.name,
          role: Role.STUDENT,
          status: "PENDING",
        },
      });
      await tx.student.create({
        data: {
          userId: newUser.id,
          stateId: data.stateId,
          boardId: data.boardId,
          schoolClassId: data.schoolClassId,
          schoolId: data.schoolId || null,
          grade: schoolClass.label,
          gradeStage: await deriveGradeStage(schoolClass.grade),
          curriculum: await deriveCurriculum(board),
        },
      });
      await tx.registrationRequest.create({
        data: {
          userId: newUser.id,
          requestedRole: Role.STUDENT,
          requestedDetails: {
            dateOfBirth: data.dateOfBirth,
            phone: data.phone,
            guardianName: data.guardianName,
            guardianPhone: data.guardianPhone,
          },
        },
      });
      await tx.auditLog.create({
        data: {
          userId: newUser.id,
          action: "REGISTRATION_SUBMITTED",
          resource: `User:${newUser.id}`,
          message: `Student registration submitted for "${data.username}"`,
        },
      });
      return newUser;
    });

    await notifyAdminsQuietly(
      { schoolId: data.schoolId || null },
      { type: "SYSTEM", title: "New student registration", message: `${data.name} ("${data.username}") is waiting for approval.` }
    );
    return { ok: true, data: { userId: user.id } };
  } catch (e) {
    if (isDuplicateAccountConstraintError(e)) return { ok: false, error: DUPLICATE_ACCOUNT_RACE_MESSAGE };
    throw e;
  }
}

// ---------------------------------------------------------------------------
// Teacher registration
// ---------------------------------------------------------------------------

const teacherRegistrationSchema = baseAccountSchema
  .extend({
    stateId: z.string().min(1, "State is required."),
    boardId: z.string().min(1, "Board is required."),
    schoolId: z.string().optional(),
    // Requested class/subject combos - nothing is granted at registration. They sit in the
    // request until a school admin approves it; approveRegistration (user-management.ts) then
    // re-validates each pair and only applies the valid ones as TeacherAssignment rows.
    requestedAssignments: z
      .array(z.object({ schoolClassId: z.string().min(1), subjectId: z.string().min(1) }))
      .min(1, "Select at least one class/subject you teach."),
  })
  .superRefine(passwordsMatch);

export async function registerTeacher(input: unknown): Promise<ActionResult<{ userId: string }>> {
  const parsed = teacherRegistrationSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  const data = parsed.data;

  const dup = await assertNoDuplicateAccount(data.username, data.email);
  if (dup) return { ok: false, error: dup };

  const board = await prisma.board.findUnique({ where: { id: data.boardId } });
  if (!board || !board.isEnabled) return { ok: false, error: "Selected board is not available." };
  if (board.type === "STATE" && board.stateId !== data.stateId) {
    return { ok: false, error: "Selected board does not belong to the selected state." };
  }

  // Validate every requested class/subject actually exists, belongs to the
  // selected board, and offers that subject - never trust the pairs blindly.
  for (const req of data.requestedAssignments) {
    const schoolClass = await prisma.schoolClass.findUnique({ where: { id: req.schoolClassId } });
    if (!schoolClass || schoolClass.boardId !== data.boardId) {
      return { ok: false, error: "One of the requested classes is not valid for the selected board." };
    }
    const link = await prisma.schoolClassSubject.findUnique({
      where: { schoolClassId_subjectId: { schoolClassId: req.schoolClassId, subjectId: req.subjectId } },
    });
    if (!link || !link.isEnabled) {
      return { ok: false, error: "One of the requested subjects is not offered for that class." };
    }
  }

  if (data.schoolId) {
    const school = await prisma.school.findUnique({ where: { id: data.schoolId } });
    if (!school || !school.isEnabled) return { ok: false, error: "Selected school is not available." };
  }

  const passwordHash = await hashPassword(data.password);

  try {
    const user = await prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: {
          username: data.username,
          email: data.email,
          passwordHash,
          name: data.name,
          role: Role.TEACHER,
          status: "PENDING",
        },
      });
      await tx.teacher.create({
        data: { userId: newUser.id, schoolId: data.schoolId || null },
      });
      await tx.registrationRequest.create({
        data: {
          userId: newUser.id,
          requestedRole: Role.TEACHER,
          requestedDetails: {
            phone: data.phone,
            stateId: data.stateId,
            boardId: data.boardId,
            requestedAssignments: data.requestedAssignments,
          },
        },
      });
      await tx.auditLog.create({
        data: {
          userId: newUser.id,
          action: "REGISTRATION_SUBMITTED",
          resource: `User:${newUser.id}`,
          message: `Teacher registration submitted for "${data.username}"`,
        },
      });
      return newUser;
    });

    await notifyAdminsQuietly(
      { schoolId: data.schoolId || null },
      { type: "SYSTEM", title: "New teacher registration", message: `${data.name} ("${data.username}") is waiting for approval.` }
    );
    return { ok: true, data: { userId: user.id } };
  } catch (e) {
    if (isDuplicateAccountConstraintError(e)) return { ok: false, error: DUPLICATE_ACCOUNT_RACE_MESSAGE };
    throw e;
  }
}

// ---------------------------------------------------------------------------
// Admin access request - security-sensitive: the requested role is always
// hardcoded to ADMIN server-side (never read from the client), and
// isSuperAdmin is always false and never accepted as input at all - there
// is no field in this schema the client could set to request it.
// ---------------------------------------------------------------------------

const adminRequestSchema = baseAccountSchema
  .extend({
    reason: z.string().trim().min(20, "Please explain why you need administrator access (at least 20 characters)."),
    schoolName: z.string().trim().min(2, "School name is required.").max(150),
    stateId: z.string().min(1, "State is required."),
    boardId: z.string().min(1, "Board is required."),
  })
  .superRefine(passwordsMatch);

// Looks up an existing School with the same name (case-insensitive) under the
// same state+board. This is only ever used to DETECT that the applicant is
// asking about a school that already exists - never to attach them to it.
// Typing an existing school's name must not make a stranger an administrator
// of that school (that would hand them every user, material and result in it),
// so an applicant for an existing school is left school-less and PENDING until
// the super administrator approves the join (see approveRegistration).
async function findExistingSchool(tx: Prisma.TransactionClient, name: string, stateId: string, boardId: string) {
  return tx.school.findFirst({
    where: { boardId, stateId, name: { equals: name, mode: "insensitive" } },
  });
}

// MVP/dev decision: a Super Admin approval gate for every admin signup is
// not part of the required school workflow while building/demoing this
// project - only production keeps the real approval requirement. This is
// the same NODE_ENV-gated pattern already used for the demo-account login
// fallback (lib/auth/users.ts) and the mock AI provider (lib/ai/provider.ts) -
// nothing here is a new authentication mechanism, it only changes which
// status a freshly-created admin User row starts in.
const AUTO_APPROVE_ADMIN_IN_DEV = process.env.NODE_ENV !== "production";

export async function registerAdminRequest(input: unknown): Promise<ActionResult<{ userId: string; joinPending: boolean }>> {
  const parsed = adminRequestSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  const data = parsed.data;

  const dup = await assertNoDuplicateAccount(data.username, data.email);
  if (dup) return { ok: false, error: dup };

  // Same validation `registerStudent`/`registerTeacher` already do - never
  // trust a client-supplied state/board pairing blindly.
  const board = await prisma.board.findUnique({ where: { id: data.boardId } });
  if (!board || !board.isEnabled) return { ok: false, error: "Selected board is not available." };
  if (board.type === "STATE" && board.stateId !== data.stateId) {
    return { ok: false, error: "Selected board does not belong to the selected state." };
  }

  const passwordHash = await hashPassword(data.password);

  try {
    let joinPending = false;
    const user = await prisma.$transaction(async (tx) => {
      const existing = await findExistingSchool(tx, data.schoolName, data.stateId, data.boardId);
      // Registering a NEW school makes this admin its first administrator.
      // Naming an EXISTING school never does - see findExistingSchool. In
      // production a brand-new school also starts disabled (hidden from the
      // public school lists) until the super administrator approves it, so an
      // unverified applicant can't squat a school name; development keeps it
      // enabled, like the auto-activated admin below.
      const school = existing ?? (await tx.school.create({ data: { name: data.schoolName, stateId: data.stateId, boardId: data.boardId, isEnabled: AUTO_APPROVE_ADMIN_IN_DEV } }));
      joinPending = existing !== null;
      // Development convenience only ever applies to creating a new school.
      const autoActivate = AUTO_APPROVE_ADMIN_IN_DEV && !joinPending;
      const newUser = await tx.user.create({
        data: {
          username: data.username,
          email: data.email,
          passwordHash,
          name: data.name,
          role: Role.ADMIN, // hardcoded - never from client input
          status: autoActivate ? "ACTIVE" : "PENDING",
        },
      });
      await tx.admin.create({
        // isSuperAdmin always false - no public path ever sets this true,
        // dev or production. A new school's founder is associated with it
        // right away; someone asking to join an existing one has no school
        // until the super administrator approves (approveRegistration then
        // sets it from requestedDetails.joinSchoolId).
        data: { userId: newUser.id, isSuperAdmin: false, schoolId: joinPending ? null : school.id },
      });
      await tx.registrationRequest.create({
        data: {
          userId: newUser.id,
          requestedRole: Role.ADMIN,
          requestedDetails: {
            phone: data.phone,
            reason: data.reason,
            schoolId: school.id,
            schoolName: school.name,
            ...(joinPending ? { joinSchoolId: school.id } : {}),
          },
          // In dev, record the founder's request as already resolved instead of
          // leaving a permanently-stale PENDING row in the Users screen -
          // reviewedByUserId stays null since no human reviewed it.
          ...(autoActivate
            ? { status: "APPROVED" as const, reviewedAt: new Date(), reviewNotes: "Auto-approved - development environment, new school founder, Super Admin approval not required for MVP." }
            : {}),
        },
      });
      await tx.auditLog.create({
        data: {
          userId: newUser.id,
          action: "REGISTRATION_SUBMITTED",
          resource: `User:${newUser.id}`,
          message: joinPending
            ? `Admin "${data.username}" requested to join existing school "${school.name}" (awaiting Super Admin approval)`
            : autoActivate
              ? `Admin account auto-activated for "${data.username}" (development mode - new school, no Super Admin approval required)`
              : `Admin access requested by "${data.username}"`,
        },
      });
      return newUser;
    });

    if (!(AUTO_APPROVE_ADMIN_IN_DEV && !joinPending)) {
      // Only a super administrator can approve another administrator.
      await notifyAdminsQuietly(
        { superOnly: true },
        { type: "SYSTEM", title: "New administrator request", message: `${data.name} ("${data.username}") asked for admin access.` }
      );
    }
    return { ok: true, data: { userId: user.id, joinPending } };
  } catch (e) {
    if (isDuplicateAccountConstraintError(e)) return { ok: false, error: DUPLICATE_ACCOUNT_RACE_MESSAGE };
    throw e;
  }
}
