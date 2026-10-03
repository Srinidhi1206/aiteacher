// One place to record an audit-log entry from actions that did not log before. Logging is bookkeeping, never part of the
// action's success: if the entry cannot be written (a dropped connection, say) the real change has already happened and
// must not be reported as failed, so any error is swallowed after being noted on the server.
import type { AuditAction } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export async function logAudit(userId: string | null, action: AuditAction, resource: string, message: string): Promise<void> {
  try {
    await prisma.auditLog.create({ data: { userId, action, resource, message: message.slice(0, 500) } });
  } catch (err) {
    console.error("[audit] could not write entry", (err as Error)?.name);
  }
}
