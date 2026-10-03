"use server";

// The signed-in user's own account: a read-only profile and a real password
// change. Identity always comes from the session cookie - there is no user id
// parameter anywhere in this file, so one user can never act on another's
// account. Passwords are only ever compared/hashed with the same bcrypt helpers
// login uses, and the hash itself is never returned.
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentSession, UnauthorizedError } from "@/lib/auth/current-session";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import type { ActionResult } from "./materials";
import { isKnownDefaultPassword } from "@/lib/auth/known-defaults";

export interface MyAccount {
  name: string;
  username: string;
  email: string;
  role: "admin" | "teacher" | "student";
  schoolName: string | null;
  stateName: string | null;
  boardName: string | null;
  className: string | null;
}

export async function getMyAccount(): Promise<MyAccount> {
  const session = await getCurrentSession();
  if (!session) throw new UnauthorizedError();
  const user = await prisma.user.findUnique({
    where: { id: session.id },
    select: {
      name: true,
      username: true,
      email: true,
      role: true,
      student: { select: { school: { select: { name: true } }, state: { select: { name: true } }, schoolClass: { select: { label: true, board: { select: { shortName: true } } } } } },
      teacher: { select: { school: { select: { name: true, board: { select: { shortName: true } } } } } },
      admin: { select: { school: { select: { name: true, board: { select: { shortName: true } } } } } },
    },
  });
  if (!user) throw new UnauthorizedError();
  return {
    name: user.name,
    username: user.username,
    email: user.email,
    role: session.role,
    schoolName: user.student?.school?.name ?? user.teacher?.school?.name ?? user.admin?.school?.name ?? null,
    stateName: user.student?.state?.name ?? null,
    boardName: user.student?.schoolClass?.board.shortName ?? user.teacher?.school?.board?.shortName ?? user.admin?.school?.board?.shortName ?? null,
    className: user.student?.schoolClass?.label ?? null,
  };
}

// Same rule as registration / createStudent / the login form.
const newPasswordSchema = z
  .string()
  .min(8, "New password must be at least 8 characters.")
  .regex(/^(?=.*[A-Za-z])(?=.*\d).{8,}$/, "New password must include at least one letter and one number.")
  .refine((p) => process.env.NODE_ENV !== "production" || !isKnownDefaultPassword(p), "That password is too common. Choose a different one.");

export async function changeMyPassword(currentPassword: string, newPassword: string): Promise<ActionResult> {
  const session = await getCurrentSession();
  if (!session) return { ok: false, error: "You need to sign in again." };

  const parsed = newPasswordSchema.safeParse(newPassword);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid password." };
  if (newPassword === currentPassword) return { ok: false, error: "Choose a password different from your current one." };

  // The one place besides login that needs the hash, so it opts back in
  // explicitly (the shared client omits it by default - see lib/prisma.ts).
  const user = await prisma.user.findUnique({ where: { id: session.id }, omit: { passwordHash: false } });
  if (!user || !(await verifyPassword(currentPassword, user.passwordHash))) {
    return { ok: false, error: "Your current password is incorrect." };
  }

  const passwordHash = await hashPassword(newPassword);
  await prisma.$transaction([
    prisma.user.update({ where: { id: session.id }, data: { passwordHash } }),
    prisma.auditLog.create({
      data: { userId: session.id, action: "PASSWORD_RESET", resource: `User:${session.id}`, message: "Changed their own password" },
    }),
  ]);
  return { ok: true };
}
