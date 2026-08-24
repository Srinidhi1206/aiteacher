// Read-only post-seed / smoke-test verification (Stage L).
//
// Run with:  npx tsx scripts/verify-database.ts
// (or:       npm run db:verify)
//
// Requires DATABASE_URL to be set - refuses to run without it. This
// script NEVER writes, updates, or deletes anything - it only counts
// rows and checks a handful of invariants, so unlike a "reset" or
// "seed" script it carries no destructive risk and needs no
// non-production confirmation gate: there is nothing here that could
// damage a real database, accidentally or otherwise. It's intentionally
// designed this way rather than adding a seed/reset flag, per the
// project's "don't introduce a heavyweight framework, and never risk
// production data" constraints for this stage.
//
// Never prints usernames, emails, or password values - only counts and
// pass/fail checks. Safe to run against any environment, including
// production, though its actual purpose is verifying a fresh
// `npm run db:seed` run succeeded (see docs/RELEASE_CHECKLIST.md).
import { PrismaClient } from "@prisma/client";

let anyFailed = false;
function check(label: string, ok: boolean) {
  console.log(`  [${ok ? "PASS" : "FAIL"}] ${label}`);
  if (!ok) anyFailed = true;
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set - nothing to connect to. Refusing to run.");
    process.exit(1);
  }

  const prisma = new PrismaClient();
  try {
    console.log("Connecting to the database...");
    await prisma.$queryRaw`SELECT 1`;
    console.log("Connected.\n");

    const [states, unionTerritories, nationalBoards, stateBoards, classes, subjects, chapters, topics, schools] = await Promise.all([
      prisma.state.count({ where: { type: "STATE" } }),
      prisma.state.count({ where: { type: "UNION_TERRITORY" } }),
      prisma.board.count({ where: { type: "NATIONAL" } }),
      prisma.board.count({ where: { type: "STATE" } }),
      prisma.schoolClass.count(),
      prisma.subject.count(),
      prisma.chapter.count(),
      prisma.topic.count(),
      prisma.school.count(),
    ]);

    console.log("Curriculum reference data:");
    console.log(`  States: ${states}`);
    console.log(`  Union Territories: ${unionTerritories}`);
    console.log(`  National boards: ${nationalBoards}`);
    console.log(`  State boards: ${stateBoards}`);
    console.log(`  Classes: ${classes}`);
    console.log(`  Subjects: ${subjects}`);
    console.log(`  Chapters: ${chapters}`);
    console.log(`  Topics: ${topics}`);
    console.log(`  Schools: ${schools}`);

    const [totalAdmins, superAdmins, students, teachers, admins, activeUsers, pendingUsers, suspendedUsers, rejectedUsers, teacherAssignments] =
      await Promise.all([
        prisma.admin.count(),
        prisma.admin.count({ where: { isSuperAdmin: true } }),
        prisma.user.count({ where: { role: "STUDENT" } }),
        prisma.user.count({ where: { role: "TEACHER" } }),
        prisma.user.count({ where: { role: "ADMIN" } }),
        prisma.user.count({ where: { status: "ACTIVE" } }),
        prisma.user.count({ where: { status: "PENDING" } }),
        prisma.user.count({ where: { status: "SUSPENDED" } }),
        prisma.user.count({ where: { status: "REJECTED" } }),
        prisma.teacherAssignment.count(),
      ]);

    console.log("\nAccounts (counts only - no usernames, emails, or passwords):");
    console.log(`  Students: ${students}, Teachers: ${teachers}, Admins: ${admins}`);
    console.log(`  Active: ${activeUsers}, Pending: ${pendingUsers}, Suspended: ${suspendedUsers}, Rejected: ${rejectedUsers}`);
    console.log(`  Admin rows: ${totalAdmins} (of which super admin: ${superAdmins})`);
    console.log(`  Teacher assignments: ${teacherAssignments}`);

    console.log("\n--- Invariant checks ---");
    check("Exactly one super admin exists", superAdmins === 1);
    check("At least one state/UT seeded", states + unionTerritories > 0);
    check("At least one national board seeded (CBSE/CISCE/NIOS)", nationalBoards > 0);
    check("At least one class seeded", classes > 0);
    check("At least one subject seeded", subjects > 0);
    check("No orphaned super-admin count (0 or 1, never more)", superAdmins <= 1);
  } finally {
    await prisma.$disconnect();
  }
}

main()
  .then(() => {
    if (anyFailed) {
      console.error("\nOne or more checks FAILED - see above.");
      process.exit(1);
    }
    console.log("\nAll checks passed.");
  })
  .catch((e) => {
    console.error("\nVerification could not complete:", e instanceof Error ? e.message : "unknown error");
    process.exit(1);
  });
