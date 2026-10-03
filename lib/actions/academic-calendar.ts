"use server";

// Administrator-managed academic calendar (holidays, exam dates, terms, school events, results ...). This file only
// decides WHO may call - any administrator, scoped by the core rules - and the rules themselves live in
// lib/calendar/core.ts so they can be tested against the real database without persisting anything. Students see
// published events through lib/actions/student-calendar.ts using the shared rule in lib/calendar/scope.ts.
import { prisma } from "@/lib/prisma";
import { ForbiddenError, UnauthorizedError } from "@/lib/auth/current-session";
import {
  createAcademicEventCore,
  updateAcademicEventCore,
  setAcademicEventPublishedCore,
  deleteAcademicEventCore,
  listAcademicEventsCore,
} from "@/lib/calendar/core";
import { requireAdminActor } from "./user-management";
import { notifyQuietly, audienceForCalendarEvent } from "@/lib/notifications/core";
import type { ActionResult } from "./materials";

async function calendarActor() {
  const a = await requireAdminActor();
  return { userId: a.userId, isSuperAdmin: a.isSuperAdmin, schoolId: a.schoolId };
}

export async function listAcademicEventsForAdmin() {
  return listAcademicEventsCore(prisma, await calendarActor());
}

export async function createAcademicEvent(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    return await createAcademicEventCore(prisma, await calendarActor(), input);
  } catch (e) {
    if (e instanceof UnauthorizedError || e instanceof ForbiddenError) return { ok: false, error: e.message };
    throw e;
  }
}

export async function updateAcademicEvent(eventId: string, input: unknown): Promise<ActionResult> {
  try {
    return await updateAcademicEventCore(prisma, await calendarActor(), eventId, input);
  } catch (e) {
    if (e instanceof UnauthorizedError || e instanceof ForbiddenError) return { ok: false, error: e.message };
    throw e;
  }
}

const TYPE_LABEL: Record<string, string> = {
  EXAM: "Exam", HOLIDAY: "Holiday", RESULT: "Results", MEETING: "Meeting", EVENT: "School event", DEADLINE: "Deadline", TERM: "Term", OTHER: "Calendar",
};

export async function setAcademicEventPublished(eventId: string, isPublished: boolean): Promise<ActionResult> {
  try {
    const actor = await calendarActor();
    const before = await prisma.academicEvent.findUnique({
      where: { id: eventId },
      select: { isPublished: true, title: true, type: true, startDate: true, schoolId: true, boardId: true, schoolClassId: true },
    });
    const result = await setAcademicEventPublishedCore(prisma, actor, eventId, isPublished);
    // Only the switch from draft to published tells students (and only when the core accepted it - it refuses
    // another school's events); toggling or repeating never re-sends.
    if (result.ok && isPublished && before && !before.isPublished) {
      await notifyQuietly(audienceForCalendarEvent(before), {
        type: before.type === "EXAM" ? "EXAM" : "SYSTEM",
        title: "New on the school calendar",
        message: `${TYPE_LABEL[before.type] ?? "Calendar"}: "${before.title}" - ${before.startDate.toISOString().slice(0, 10)}.`,
      });
    }
    return result;
  } catch (e) {
    if (e instanceof UnauthorizedError || e instanceof ForbiddenError) return { ok: false, error: e.message };
    throw e;
  }
}

export async function deleteAcademicEvent(eventId: string): Promise<ActionResult> {
  try {
    return await deleteAcademicEventCore(prisma, await calendarActor(), eventId);
  } catch (e) {
    if (e instanceof UnauthorizedError || e instanceof ForbiddenError) return { ok: false, error: e.message };
    throw e;
  }
}
