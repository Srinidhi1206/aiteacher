"use server";

// Class timetables. This file only decides WHO may call - administrators for the management actions (scoped by the core
// rules), signed-in students for their own timetable - and the rules themselves live in lib/timetable/core.ts so they can be
// tested against the real database. A timetable is NOT an academic-calendar event: it is the weekly pattern of periods.
import { prisma } from "@/lib/prisma";
import { ForbiddenError, UnauthorizedError, requireRole } from "@/lib/auth/current-session";
import { confirmTimetableImportCore, deleteTimetableCore, getTimetableCore, listTimetablesCore, setTimetablePublishedCore, studentTimetableCore } from "@/lib/timetable/core";
import { requireAdminActor } from "./user-management";

async function actor() {
  const a = await requireAdminActor();
  return { userId: a.userId, isSuperAdmin: a.isSuperAdmin, schoolId: a.schoolId };
}

type Plain = { ok: boolean; error?: string };
function guard<T extends Plain>(fallback: (msg: string) => T) {
  return (e: unknown): T => {
    if (e instanceof UnauthorizedError || e instanceof ForbiddenError) return fallback(e.message);
    throw e;
  };
}

export async function listTimetablesForAdmin() {
  return listTimetablesCore(prisma, await actor());
}

export async function getTimetableForAdmin(id: string) {
  return getTimetableCore(prisma, await actor(), id);
}

export async function confirmTimetableImport(input: unknown): Promise<{ ok: boolean; error?: string; data?: { timetables: { id: string; className: string; section: string; periods: number; replaced: boolean }[] } }> {
  try {
    const res = await confirmTimetableImportCore(prisma, await actor(), input);
    return res.ok ? { ok: true, data: res.data } : { ok: false, error: res.error };
  } catch (e) {
    return guard<Plain>((error) => ({ ok: false, error }))(e);
  }
}

export async function setTimetablePublished(id: string, isPublished: boolean): Promise<Plain> {
  try {
    const res = await setTimetablePublishedCore(prisma, await actor(), id, isPublished);
    return res.ok ? { ok: true } : { ok: false, error: res.error };
  } catch (e) {
    return guard<Plain>((error) => ({ ok: false, error }))(e);
  }
}

export async function deleteTimetable(id: string): Promise<Plain> {
  try {
    const res = await deleteTimetableCore(prisma, await actor(), id);
    return res.ok ? { ok: true } : { ok: false, error: res.error };
  } catch (e) {
    return guard<Plain>((error) => ({ ok: false, error }))(e);
  }
}

/** The signed-in student's own timetable (their school, class and section), or null. Identity comes only from the session. */
export async function getMyTimetable() {
  const session = await requireRole("student");
  const student = await prisma.student.findUnique({ where: { userId: session.id }, select: { userId: true, schoolId: true, schoolClassId: true } });
  if (!student) return null;
  return studentTimetableCore(prisma, student);
}
