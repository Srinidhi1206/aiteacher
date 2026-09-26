"use server";

// Which classes and subjects a teacher may teach (TeacherAssignment). Until
// now only prisma/seed.ts could create these rows, so a real teacher who
// registered and was approved could never create an exam or worksheet - every
// teacher action is gated on an assignment (requireOwnedAssignment). This is
// the admin side of that.
//
// Authorization, all derived from the database, never from the client:
//   - the acting admin must be able to manage the teacher's school (their own
//     school, or a super admin) - same boundary as the user-management actions;
//   - the class must belong to the board of the teacher's school (a school
//     teaches one board); a school with no board can only be handled by a
//     super admin;
//   - the subject must be one that class actually offers (SchoolClassSubject).
// A teacher in another school is answered exactly like a missing one.
import { prisma } from "@/lib/prisma";
import { ForbiddenError, UnauthorizedError } from "@/lib/auth/current-session";
import { requireAdminActor } from "./user-management";
import type { ActionResult } from "./materials";

type Actor = Awaited<ReturnType<typeof requireAdminActor>>;

async function loadManageableTeacher(actor: Actor, teacherUserId: string) {
  const teacher = await prisma.teacher.findUnique({
    where: { userId: teacherUserId },
    include: { school: { select: { boardId: true } }, user: { select: { name: true, username: true, status: true } } },
  });
  if (!teacher) return null;
  const allowed = actor.isSuperAdmin || (actor.schoolId !== null && teacher.schoolId === actor.schoolId);
  return allowed ? teacher : null;
}

export interface TeacherAssignmentRow {
  id: string;
  schoolClassId: string;
  subjectId: string;
  classLabel: string;
  subjectName: string;
}

/** The teacher's current assignments, plus the board their school teaches (so the UI can offer that board's classes). */
export async function listTeacherAssignments(
  teacherUserId: string
): Promise<ActionResult<{ boardId: string | null; assignments: TeacherAssignmentRow[] }>> {
  try {
    const actor = await requireAdminActor();
    const teacher = await loadManageableTeacher(actor, teacherUserId);
    if (!teacher) return { ok: false, error: "Teacher not found." };
    const rows = await prisma.teacherAssignment.findMany({
      where: { teacherId: teacher.id },
      include: { schoolClass: { select: { label: true, grade: true } }, subject: { select: { name: true } } },
      orderBy: [{ schoolClass: { grade: "asc" } }, { subject: { name: "asc" } }],
    });
    return {
      ok: true,
      data: {
        boardId: teacher.school?.boardId ?? null,
        assignments: rows.map((r) => ({
          id: r.id,
          schoolClassId: r.schoolClassId,
          subjectId: r.subjectId,
          classLabel: r.schoolClass.label,
          subjectName: r.subject.name,
        })),
      },
    };
  } catch (e) {
    if (e instanceof UnauthorizedError || e instanceof ForbiddenError) return { ok: false, error: e.message };
    throw e;
  }
}

export async function assignTeacherToClassSubject(teacherUserId: string, schoolClassId: string, subjectId: string): Promise<ActionResult> {
  try {
    const actor = await requireAdminActor();
    const teacher = await loadManageableTeacher(actor, teacherUserId);
    if (!teacher) return { ok: false, error: "Teacher not found." };
    if (teacher.user.status !== "ACTIVE") return { ok: false, error: "Only active teachers can be assigned." };
    if (!teacher.schoolId) return { ok: false, error: "This teacher isn't associated with a school, so they can't be assigned." };

    const schoolBoardId = teacher.school?.boardId ?? null;
    if (!schoolBoardId && !actor.isSuperAdmin) {
      return { ok: false, error: "This school has no board set. Contact the super administrator." };
    }

    const schoolClass = await prisma.schoolClass.findUnique({ where: { id: schoolClassId } });
    if (!schoolClass || !schoolClass.isEnabled) return { ok: false, error: "Class not found." };
    if (schoolBoardId && schoolClass.boardId !== schoolBoardId) {
      return { ok: false, error: "That class is not part of this school's board." };
    }

    const offered = await prisma.schoolClassSubject.findUnique({
      where: { schoolClassId_subjectId: { schoolClassId, subjectId } },
      include: { subject: { select: { name: true } } },
    });
    if (!offered || !offered.isEnabled) return { ok: false, error: "That subject isn't offered for that class." };

    const existing = await prisma.teacherAssignment.findUnique({
      where: { teacherId_schoolClassId_subjectId: { teacherId: teacher.id, schoolClassId, subjectId } },
    });
    if (existing) return { ok: true }; // already assigned - idempotent

    await prisma.$transaction([
      prisma.teacherAssignment.create({ data: { teacherId: teacher.id, schoolClassId, subjectId } }),
      prisma.auditLog.create({
        data: {
          userId: actor.userId,
          action: "CLASS_CHANGE",
          resource: `Teacher:${teacher.id}`,
          message: `Assigned "${teacher.user.username}" to ${schoolClass.label} - ${offered.subject.name}`,
        },
      }),
    ]);
    return { ok: true };
  } catch (e) {
    if (e instanceof UnauthorizedError || e instanceof ForbiddenError) return { ok: false, error: e.message };
    throw e;
  }
}

export async function removeTeacherAssignment(assignmentId: string): Promise<ActionResult> {
  try {
    const actor = await requireAdminActor();
    const assignment = await prisma.teacherAssignment.findUnique({
      where: { id: assignmentId },
      include: {
        teacher: { select: { userId: true, user: { select: { username: true } } } },
        schoolClass: { select: { label: true } },
        subject: { select: { name: true } },
      },
    });
    // Ownership is checked through the teacher, so an assignment id from
    // another school answers exactly like a missing one.
    if (!assignment || !(await loadManageableTeacher(actor, assignment.teacher.userId))) {
      return { ok: false, error: "Assignment not found." };
    }
    await prisma.$transaction([
      prisma.teacherAssignment.delete({ where: { id: assignmentId } }),
      prisma.auditLog.create({
        data: {
          userId: actor.userId,
          action: "CLASS_CHANGE",
          resource: `Teacher:${assignment.teacherId}`,
          message: `Removed "${assignment.teacher.user.username}" from ${assignment.schoolClass.label} - ${assignment.subject.name}`,
        },
      }),
    ]);
    return { ok: true };
  } catch (e) {
    if (e instanceof UnauthorizedError || e instanceof ForbiddenError) return { ok: false, error: e.message };
    throw e;
  }
}
