"use server";

// The real audit trail (AuditLog) for the admin Logs tab. Every important
// action in the app already writes a row here (user suspend/reactivate,
// registration decisions, password resets, curriculum changes, material and
// exam actions...); until now nothing read them. Scope follows the same
// boundary as everything else: a school admin sees only actions performed by
// members of their own school, a super admin sees the whole platform, and an
// admin with no school sees nothing.
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

export async function listActivityLogs(): Promise<ActivityLogRow[]> {
  const actor = await requireAdminActor();
  if (!actor.isSuperAdmin && !actor.schoolId) return [];

  const schoolId = actor.isSuperAdmin ? null : actor.schoolId;
  const rows = await prisma.auditLog.findMany({
    where: schoolId
      ? { user: { OR: [{ student: { schoolId } }, { teacher: { schoolId } }, { admin: { schoolId } }] } }
      : {},
    orderBy: { createdAt: "desc" },
    take: MAX_ROWS,
    select: { id: true, action: true, message: true, createdAt: true, user: { select: { username: true } } },
  });
  return rows.map((r) => ({ id: r.id, action: r.action, message: r.message, createdAt: r.createdAt, by: r.user?.username ?? null }));
}
