"use server";

// The signed-in teacher's own upcoming events. Identity comes only from the session; there is no id parameter.
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth/current-session";
import { listUpcomingForTeacher } from "@/lib/calendar/teacher";

export interface TeacherUpcomingRow {
  id: string;
  kind: "event" | "exam";
  title: string;
  typeLabel: string;
  startDate: string; // ISO
  endDate: string | null;
  detail: string;
}

export async function getMyUpcomingForTeacher(): Promise<TeacherUpcomingRow[]> {
  const session = await requireRole("teacher");
  const items = await listUpcomingForTeacher(prisma, session.id);
  return items.map((i) => ({ ...i, startDate: i.startDate.toISOString(), endDate: i.endDate ? i.endDate.toISOString() : null }));
}
