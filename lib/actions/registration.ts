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
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth/password";
import type { ActionResult } from "./materials";
import { GradeStage, Curriculum, Role, BoardType } from "@prisma/client";

// Shared across all three registration forms.
const PASSWORD_REGEX = /^(?=.*[A-Za-z])(?=.*\d).{8,}$/; // >=8 chars, at least one letter and one digit
const passwordField = z
  .string()
  .min(8, "Password must be at least 8 characters.")
  .regex(PASSWORD_REGEX, "Password must include at least one letter and one number.");

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

function deriveGradeStage(grade: number): GradeStage {
  if (grade <= 5) return GradeStage.PRIMARY;
  if (grade <= 8) return GradeStage.MIDDLE_SCHOOL;
  return GradeStage.HIGH_SCHOOL;
}

function deriveCurriculum(board: { shortName: string; type: BoardType }): Curriculum {
  if (board.shortName === "CBSE") return Curriculum.CBSE;
  if (board.shortName === "CISCE") return Curriculum.ICSE;
  return Curriculum.STATE_BOARD;
}

/** Confirms the client-selected board/class actually form a real, currently-enabled combination - never trusts the IDs blindly. */
async function validateCurriculumSelection(stateId: string | undefined, boardId: string, schoolClassId: string) {
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
  }

  const passwordHash = await hashPassword(data.password);

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
        gradeStage: deriveGradeStage(schoolClass.grade),
        curriculum: deriveCurriculum(board),
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

  return { ok: true, data: { userId: user.id } };
}

// ---------------------------------------------------------------------------
// Teacher registration
// ---------------------------------------------------------------------------

const teacherRegistrationSchema = baseAccountSchema
  .extend({
    stateId: z.string().min(1, "State is required."),
    boardId: z.string().min(1, "Board is required."),
    schoolId: z.string().optional(),
    // Requested class/subject combos - reviewed by an admin, never
    // auto-applied as real TeacherAssignment rows (see the schema comment
    // on RegistrationRequest.requestedDetails). The admin grants actual
    // assignments explicitly after approval.
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

  return { ok: true, data: { userId: user.id } };
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
  })
  .superRefine(passwordsMatch);

export async function registerAdminRequest(input: unknown): Promise<ActionResult<{ userId: string }>> {
  const parsed = adminRequestSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  const data = parsed.data;

  const dup = await assertNoDuplicateAccount(data.username, data.email);
  if (dup) return { ok: false, error: dup };

  const passwordHash = await hashPassword(data.password);

  const user = await prisma.$transaction(async (tx) => {
    const newUser = await tx.user.create({
      data: {
        username: data.username,
        email: data.email,
        passwordHash,
        name: data.name,
        role: Role.ADMIN, // hardcoded - never from client input
        status: "PENDING",
      },
    });
    await tx.admin.create({
      data: { userId: newUser.id, isSuperAdmin: false }, // always false - no public path ever sets this true
    });
    await tx.registrationRequest.create({
      data: {
        userId: newUser.id,
        requestedRole: Role.ADMIN,
        requestedDetails: { phone: data.phone, reason: data.reason },
      },
    });
    await tx.auditLog.create({
      data: {
        userId: newUser.id,
        action: "REGISTRATION_SUBMITTED",
        resource: `User:${newUser.id}`,
        message: `Admin access requested by "${data.username}"`,
      },
    });
    return newUser;
  });

  return { ok: true, data: { userId: user.id } };
}
