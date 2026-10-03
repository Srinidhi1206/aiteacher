"use server";

// The real audit trail (AuditLog) for the admin Logs tab. Every important
// action in the app already writes a row here (user suspend/reactivate,
// registration decisions, password resets, curriculum changes, material and
// exam actions...); until now nothing read them. Scope follows the same
// boundary as everything else: a school admin sees only actions performed by
// members of their own school, a super admin sees the whole platform, and an
// admin with no school sees nothing.
import { AuditAction, type Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdminActor } from "./user-management";

const MAX_ROWS = 100;

export interface ActivityLogRow {
  id: string;
  action: string;
  message: string;
  createdAt: Date;
  by: string | null;
}

/** The kinds of action that can appear in the log, for the filter dropdown. */
export async function listActivityLogActions(): Promise<string[]> {
  await requireAdminActor();
  return Object.values(AuditAction);
}

/**
 * The most recent actions in the admin's scope. `action` and `query` narrow it on the server, so a search covers the
 * whole history rather than just the latest rows.
 */
export async function listActivityLogs(filters?: { action?: string; query?: string }): Promise<ActivityLogRow[]> {
  const actor = await requireAdminActor();
  if (!actor.isSuperAdmin && !actor.schoolId) return [];

  const schoolId = actor.isSuperAdmin ? null : actor.schoolId;
  const action = filters?.action && (Object.values(AuditAction) as string[]).includes(filters.action) ? (filters.action as AuditAction) : undefined;
  const query = filters?.query?.trim().slice(0, 100);
  const scope: Prisma.AuditLogWhereInput = schoolId ? { user: { OR: [{ student: { schoolId } }, { teacher: { schoolId } }, { admin: { schoolId } }] } } : {};
  const rows = await prisma.auditLog.findMany({
    where: {
      ...scope,
      ...(action ? { action } : {}),
      ...(query ? { OR: [{ message: { contains: query, mode: "insensitive" } }, { user: { username: { contains: query, mode: "insensitive" } } }] } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: MAX_ROWS,
    select: { id: true, action: true, message: true, createdAt: true, user: { select: { username: true } } },
  });
  return rows.map((r) => ({ id: r.id, action: r.action, message: r.message, createdAt: r.createdAt, by: r.user?.username ?? null }));
}
