"use server";

// Real analytics for the admin dashboard (Stage H), scoped per admin.
// Aggregate-only by design - no individual student/user record is ever
// returned from here (that's what the existing Users tab is for). Every
// export re-verifies the caller is an admin via the existing
// requireAdminActor() (lib/actions/user-management.ts) - reused, not
// duplicated. All counts use Prisma's `.count()`, which Postgres executes
// as an index-backed aggregate, not a full table load into memory.
//
// Scope: a super admin is platform-level and sees the whole platform
// (unchanged). A school admin sees only their own school - users/requests by
// school membership, materials by StudyMaterial.schoolId, exams/worksheets by
// their author's school and submissions/AI conversations by the student's
// school - the school always coming from the admin's own row, never the
// client. A normal admin with no school has no school to report on and gets
// zeros, the same "can manage nobody" rule the user-management actions use.
import { prisma } from "@/lib/prisma";
import { requireAdminActor } from "./user-management";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export type AnalyticsScope = { kind: "platform" } | { kind: "school"; schoolName: string | null } | { kind: "none" };

export interface PlatformAnalytics {
  scope: AnalyticsScope;
  usersByRole: { students: number; teachers: number; admins: number };
  usersByStatus: { pending: number; active: number; rejected: number; suspended: number };
  pendingRegistrations: { students: number; teachers: number; admins: number; total: number };
  registrationsLast30Days: number;
  content: {
    schools: number;
    states: number;
    boards: number;
    classes: number;
    subjects: number;
    topics: number;
  };
  materials: { total: number; published: number };
  worksheets: number;
  exams: { total: number; published: number };
  examSubmissions: { total: number; graded: number };
  aiConversations: number;
}

const EMPTY: Omit<PlatformAnalytics, "scope"> = {
  usersByRole: { students: 0, teachers: 0, admins: 0 },
  usersByStatus: { pending: 0, active: 0, rejected: 0, suspended: 0 },
  pendingRegistrations: { students: 0, teachers: 0, admins: 0, total: 0 },
  registrationsLast30Days: 0,
  content: { schools: 0, states: 0, boards: 0, classes: 0, subjects: 0, topics: 0 },
  materials: { total: 0, published: 0 },
  worksheets: 0,
  exams: { total: 0, published: 0 },
  examSubmissions: { total: 0, graded: 0 },
  aiConversations: 0,
};

export async function getPlatformAnalytics(): Promise<PlatformAnalytics> {
  const actor = await requireAdminActor();

  if (!actor.isSuperAdmin && !actor.schoolId) return { scope: { kind: "none" }, ...EMPTY };

  const thirtyDaysAgo = new Date(Date.now() - THIRTY_DAYS_MS);
  const schoolId = actor.isSuperAdmin ? null : actor.schoolId;

  // Every "school-owned" filter below is empty for a super admin (whole
  // platform) and pinned to the admin's own school otherwise.
  const member = schoolId
    ? { OR: [{ student: { schoolId } }, { teacher: { schoolId } }, { admin: { schoolId } }] }
    : {};
  const byAuthor = schoolId ? { teacher: { schoolId } } : {};
  const byStudent = schoolId ? { student: { schoolId } } : {};
  const materialWhere = schoolId ? { schoolId } : {};

  const [
    students,
    teachers,
    admins,
    pendingUsers,
    activeUsers,
    rejectedUsers,
    suspendedUsers,
    pendingStudentReq,
    pendingTeacherReq,
    pendingAdminReq,
    registrationsLast30Days,
    schools,
    states,
    boards,
    classes,
    subjects,
    topics,
    materialsTotal,
    materialsPublished,
    worksheets,
    examsTotal,
    examsPublished,
    submissionsTotal,
    submissionsGraded,
    aiConversations,
    school,
  ] = await Promise.all([
    prisma.user.count({ where: { role: "STUDENT", ...member } }),
    prisma.user.count({ where: { role: "TEACHER", ...member } }),
    prisma.user.count({ where: { role: "ADMIN", ...member } }),
    prisma.user.count({ where: { status: "PENDING", ...member } }),
    prisma.user.count({ where: { status: "ACTIVE", ...member } }),
    prisma.user.count({ where: { status: "REJECTED", ...member } }),
    prisma.user.count({ where: { status: "SUSPENDED", ...member } }),
    prisma.registrationRequest.count({ where: { status: "PENDING", requestedRole: "STUDENT", user: member } }),
    prisma.registrationRequest.count({ where: { status: "PENDING", requestedRole: "TEACHER", user: member } }),
    prisma.registrationRequest.count({ where: { status: "PENDING", requestedRole: "ADMIN", user: member } }),
    prisma.user.count({ where: { createdAt: { gte: thirtyDaysAgo }, ...member } }),
    // A school admin's "schools" is just their own; the curriculum reference
    // counts below (states/boards/classes/subjects/topics) are the shared,
    // global curriculum every school teaches from, not school-owned data.
    schoolId ? Promise.resolve(1) : prisma.school.count(),
    prisma.state.count(),
    prisma.board.count(),
    prisma.schoolClass.count(),
    prisma.subject.count(),
    prisma.topic.count(),
    prisma.studyMaterial.count({ where: materialWhere }),
    prisma.studyMaterial.count({ where: { ...materialWhere, isPublished: true } }),
    prisma.worksheet.count({ where: byAuthor }),
    prisma.exam.count({ where: byAuthor }),
    prisma.exam.count({ where: { ...byAuthor, status: "PUBLISHED" } }),
    prisma.examSubmission.count({ where: { status: { in: ["SUBMITTED", "GRADED"] }, ...byStudent } }),
    prisma.examSubmission.count({ where: { status: "GRADED", ...byStudent } }),
    prisma.aIConversation.count({ where: byStudent }),
    schoolId ? prisma.school.findUnique({ where: { id: schoolId }, select: { name: true } }) : Promise.resolve(null),
  ]);

  return {
    scope: schoolId ? { kind: "school", schoolName: school?.name ?? null } : { kind: "platform" },
    usersByRole: { students, teachers, admins },
    usersByStatus: { pending: pendingUsers, active: activeUsers, rejected: rejectedUsers, suspended: suspendedUsers },
    pendingRegistrations: {
      students: pendingStudentReq,
      teachers: pendingTeacherReq,
      admins: pendingAdminReq,
      total: pendingStudentReq + pendingTeacherReq + pendingAdminReq,
    },
    registrationsLast30Days,
    content: { schools, states, boards, classes, subjects, topics },
    materials: { total: materialsTotal, published: materialsPublished },
    worksheets,
    exams: { total: examsTotal, published: examsPublished },
    examSubmissions: { total: submissionsTotal, graded: submissionsGraded },
    aiConversations,
  };
}
