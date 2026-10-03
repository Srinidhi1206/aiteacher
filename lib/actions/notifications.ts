"use server";

// The signed-in user's own notifications. Identity comes only from the session cookie - there is no user id parameter,
// so nobody can read or mark someone else's. A missing session is not an error here (the bell sits in the page chrome):
// it simply has nothing to show.
import { prisma } from "@/lib/prisma";
import { getCurrentSession } from "@/lib/auth/current-session";

export interface MyNotification {
  id: string;
  type: string;
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
}

export async function getMyNotifications(): Promise<{ unread: number; items: MyNotification[] }> {
  const session = await getCurrentSession();
  if (!session) return { unread: 0, items: [] };
  const [unread, rows] = await Promise.all([
    prisma.notification.count({ where: { userId: session.id, read: false } }),
    prisma.notification.findMany({ where: { userId: session.id }, orderBy: { createdAt: "desc" }, take: 20 }),
  ]);
  return {
    unread,
    items: rows.map((n) => ({ id: n.id, type: n.type, title: n.title, message: n.message, read: n.read, createdAt: n.createdAt.toISOString() })),
  };
}

/** Marks the caller's own notifications read - all of them, or only the given ids. */
export async function markMyNotificationsRead(ids?: string[]): Promise<void> {
  const session = await getCurrentSession();
  if (!session) return;
  await prisma.notification.updateMany({
    where: { userId: session.id, read: false, ...(ids ? { id: { in: ids.slice(0, 50) } } : {}) },
    data: { read: true },
  });
}
