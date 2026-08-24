"use server";

// Real platform-level analytics for the admin dashboard (Stage H).
// Aggregate-only by design - no individual student/user record is ever
// returned from here (that's what the existing Users tab is for). Every
// export re-verifies the caller is an admin via the existing
// requireAdminActor() (lib/actions/user-management.ts) - reused, not
// duplicated. All counts use Prisma's `.count()`, which Postgres executes
// as an index-backed aggregate, not a full table load into memory.
import { prisma } from "@/lib/prisma";
import { requireAdminActor } from "./user-management";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export interface PlatformAnalytics {
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

export async function getPlatformAnalytics(): Promise<PlatformAnalytics> {
  await requireAdminActor();

  const thirtyDaysAgo = new Date(Date.now() - THIRTY_DAYS_MS);

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
  ] = await Promise.all([
    prisma.user.count({ where: { role: "STUDENT" } }),
    prisma.user.count({ where: { role: "TEACHER" } }),
    prisma.user.count({ where: { role: "ADMIN" } }),
    prisma.user.count({ where: { status: "PENDING" } }),
    prisma.user.count({ where: { status: "ACTIVE" } }),
    prisma.user.count({ where: { status: "REJECTED" } }),
    prisma.user.count({ where: { status: "SUSPENDED" } }),
    prisma.registrationRequest.count({ where: { status: "PENDING", requestedRole: "STUDENT" } }),
    prisma.registrationRequest.count({ where: { status: "PENDING", requestedRole: "TEACHER" } }),
    prisma.registrationRequest.count({ where: { status: "PENDING", requestedRole: "ADMIN" } }),
    prisma.user.count({ where: { createdAt: { gte: thirtyDaysAgo } } }),
    prisma.school.count(),
    prisma.state.count(),
    prisma.board.count(),
    prisma.schoolClass.count(),
    prisma.subject.count(),
    prisma.topic.count(),
    prisma.studyMaterial.count(),
    prisma.studyMaterial.count({ where: { isPublished: true } }),
    prisma.worksheet.count(),
    prisma.exam.count(),
    prisma.exam.count({ where: { status: "PUBLISHED" } }),
    prisma.examSubmission.count({ where: { status: { in: ["SUBMITTED", "GRADED"] } } }),
    prisma.examSubmission.count({ where: { status: "GRADED" } }),
    prisma.aIConversation.count(),
  ]);

  return {
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
