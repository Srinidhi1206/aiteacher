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
import { prisma } from "@/lib/prisma";
import { getCurrentSession, ForbiddenError, UnauthorizedError } from "@/lib/auth/current-session";
import type { ActionResult } from "./materials";
import { Role } from "@prisma/client";

interface AdminActor {
  userId: string;
  adminId: string;
  isSuperAdmin: boolean;
}

/** Confirms the caller is an admin and returns their fresh (not session-cached) isSuperAdmin status. */
export async function requireAdminActor(): Promise<AdminActor> {
  const session = await getCurrentSession();
  if (!session) throw new UnauthorizedError();
  if (session.role !== "admin") throw new ForbiddenError("Admin access required.");
  const admin = await prisma.admin.findUnique({ where: { userId: session.id } });
  if (!admin) throw new ForbiddenError("Admin profile not found.");
  return { userId: session.id, adminId: admin.id, isSuperAdmin: admin.isSuperAdmin };
}

function requireSuperAdmin(actor: AdminActor) {
  if (!actor.isSuperAdmin) {
    throw new ForbiddenError("Only the super administrator can perform this action.");
  }
}

// ---------------------------------------------------------------------------
// Registration approval
// ---------------------------------------------------------------------------

export async function listRegistrationRequests(filters?: { status?: "PENDING" | "APPROVED" | "REJECTED" }) {
  await requireAdminActor();
  return prisma.registrationRequest.findMany({
    where: { status: filters?.status },
    include: { user: true, reviewedBy: true },
    orderBy: { submittedAt: "desc" },
  });
}

export async function approveRegistration(requestId: string): Promise<ActionResult> {
  try {
    const actor = await requireAdminActor();
    const request = await prisma.registrationRequest.findUnique({ where: { id: requestId }, include: { user: true } });
    if (!request) return { ok: false, error: "Registration request not found." };
    if (request.status !== "PENDING") return { ok: false, error: "This request has already been reviewed." };

    // Only a super admin may approve another admin - this is the one rule
    // that most directly prevents unauthorized admin creation.
    if (request.requestedRole === Role.ADMIN) requireSuperAdmin(actor);

    // An admin can never approve their own request - review must come
    // from a different account.
    if (request.userId === actor.userId) return { ok: false, error: "You cannot approve your own registration." };

    await prisma.$transaction([
      prisma.user.update({ where: { id: request.userId }, data: { status: "ACTIVE" } }),
      prisma.registrationRequest.update({
        where: { id: requestId },
        data: { status: "APPROVED", reviewedAt: new Date(), reviewedByUserId: actor.userId },
      }),
      prisma.auditLog.create({
        data: {
          userId: actor.userId,
          action: "REGISTRATION_APPROVED",
          resource: `User:${request.userId}`,
          message: `Approved ${request.requestedRole} registration for "${request.user.username}"`,
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
    const request = await prisma.registrationRequest.findUnique({ where: { id: requestId }, include: { user: true } });
    if (!request) return { ok: false, error: "Registration request not found." };
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

    const target = await prisma.user.findUnique({ where: { id: userId }, include: { admin: true } });
    if (!target) return { ok: false, error: "User not found." };

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
    const target = await prisma.user.findUnique({ where: { id: userId }, include: { admin: true } });
    if (!target) return { ok: false, error: "User not found." };
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
// UI convenience only - lets the client show/hide admin-only controls. This
// is NOT the authorization boundary; every mutation above re-checks
// isSuperAdmin itself regardless of what the client was told here.
// ---------------------------------------------------------------------------

export async function getMyAdminStatus(): Promise<{ isSuperAdmin: boolean } | null> {
  try {
    const actor = await requireAdminActor();
    return { isSuperAdmin: actor.isSuperAdmin };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Listing (Admin > Users)
// ---------------------------------------------------------------------------

export async function listUsersForAdmin(filters?: { role?: Role; status?: "PENDING" | "ACTIVE" | "REJECTED" | "SUSPENDED" }) {
  await requireAdminActor();
  return prisma.user.findMany({
    where: { role: filters?.role, status: filters?.status },
    include: {
      student: { include: { schoolClass: true, board: true, state: true } },
      teacher: { include: { school: true, assignments: { include: { schoolClass: true, subject: true } } } },
      admin: true,
      registrationRequest: true,
    },
    orderBy: { createdAt: "desc" },
  });
}
