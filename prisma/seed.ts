// Stage A seed script - populates reference/config data only:
// States/UTs, Boards (national + state), Class 1-10 for the national
// boards, a starter Subject catalog, the Achievement catalog, and default
// System Settings.
//
// Deliberately does NOT seed User/Student/Teacher/Admin accounts - that
// requires password hashing, which is Stage B (real authentication) work.
// The existing demo accounts in lib/auth/users.ts keep working unchanged
// until Stage B switches auth over to the database.
//
// Run with: npm run db:seed  (requires DATABASE_URL/DIRECT_URL to be set -
// see docs/DATABASE.md; this will fail without a real database, which is
// expected until Stage A's database step is actually provisioned).

import { PrismaClient, BoardType, RegionType, Role } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

// Mirrors lib/auth/password.ts's hashPassword() - duplicated rather than
// imported because that module has `import "server-only"` at the top,
// which throws under plain Node execution (this seed script runs via tsx,
// outside Next.js's build pipeline where "server-only" is specially
// resolved). Keep SALT_ROUNDS in sync with lib/auth/password.ts if changed.
const SALT_ROUNDS = 12;
function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

// ---------------------------------------------------------------------------
// Reference data - see docs/BOARDS.md for the full table and sourcing notes.
// Board names/short-names are the commonly used current names as of this
// writing; an admin can edit/rename/deactivate any of these later (Stage C)
// without a code change, which is the whole point of modeling them as rows
// instead of a hard-coded enum.
// ---------------------------------------------------------------------------

const NATIONAL_BOARDS = [
  { shortName: "CBSE", name: "Central Board of Secondary Education" },
  { shortName: "CISCE", name: "Council for the Indian School Certificate Examinations (ICSE / ISC)" },
  { shortName: "NIOS", name: "National Institute of Open Schooling" },
];

interface StateSeed {
  name: string;
  code: string;
  type: "STATE" | "UNION_TERRITORY";
  board?: { shortName: string; name: string };
}

const STATES: StateSeed[] = [
  { name: "Andhra Pradesh", code: "AP", type: "STATE", board: { shortName: "BSEAP", name: "Board of Secondary Education, Andhra Pradesh" } },
  { name: "Arunachal Pradesh", code: "AR", type: "STATE", board: { shortName: "APBSE", name: "Arunachal Pradesh Board of Secondary Education" } },
  { name: "Assam", code: "AS", type: "STATE", board: { shortName: "SEBA", name: "Board of Secondary Education, Assam" } },
  { name: "Bihar", code: "BR", type: "STATE", board: { shortName: "BSEB", name: "Bihar School Examination Board" } },
  { name: "Chhattisgarh", code: "CG", type: "STATE", board: { shortName: "CGBSE", name: "Chhattisgarh Board of Secondary Education" } },
  { name: "Goa", code: "GA", type: "STATE", board: { shortName: "GBSHSE", name: "Goa Board of Secondary and Higher Secondary Education" } },
  { name: "Gujarat", code: "GJ", type: "STATE", board: { shortName: "GSEB", name: "Gujarat Secondary and Higher Secondary Education Board" } },
  { name: "Haryana", code: "HR", type: "STATE", board: { shortName: "BSEH", name: "Board of School Education Haryana" } },
  { name: "Himachal Pradesh", code: "HP", type: "STATE", board: { shortName: "HPBOSE", name: "Himachal Pradesh Board of School Education" } },
  { name: "Jharkhand", code: "JH", type: "STATE", board: { shortName: "JAC", name: "Jharkhand Academic Council" } },
  { name: "Karnataka", code: "KA", type: "STATE", board: { shortName: "KSEAB", name: "Karnataka School Examination and Assessment Board" } },
  { name: "Kerala", code: "KL", type: "STATE", board: { shortName: "KBPE", name: "Kerala Board of Public Examinations" } },
  { name: "Madhya Pradesh", code: "MP", type: "STATE", board: { shortName: "MPBSE", name: "Madhya Pradesh Board of Secondary Education" } },
  { name: "Maharashtra", code: "MH", type: "STATE", board: { shortName: "MSBSHSE", name: "Maharashtra State Board of Secondary and Higher Secondary Education" } },
  { name: "Manipur", code: "MN", type: "STATE", board: { shortName: "BOSEM", name: "Board of Secondary Education Manipur" } },
  { name: "Meghalaya", code: "ML", type: "STATE", board: { shortName: "MBOSE", name: "Meghalaya Board of School Education" } },
  { name: "Mizoram", code: "MZ", type: "STATE", board: { shortName: "MBSE", name: "Mizoram Board of School Education" } },
  { name: "Nagaland", code: "NL", type: "STATE", board: { shortName: "NBSE", name: "Nagaland Board of School Education" } },
  { name: "Odisha", code: "OD", type: "STATE", board: { shortName: "BSE Odisha", name: "Board of Secondary Education, Odisha" } },
  { name: "Punjab", code: "PB", type: "STATE", board: { shortName: "PSEB", name: "Punjab School Education Board" } },
  { name: "Rajasthan", code: "RJ", type: "STATE", board: { shortName: "RBSE", name: "Board of Secondary Education Rajasthan" } },
  { name: "Sikkim", code: "SK", type: "STATE", board: { shortName: "SBSE", name: "Sikkim Board of Secondary Education" } },
  { name: "Tamil Nadu", code: "TN", type: "STATE", board: { shortName: "TNBSE", name: "Tamil Nadu State Board of School Examinations" } },
  { name: "Telangana", code: "TG", type: "STATE", board: { shortName: "BSE Telangana", name: "Telangana State Board of Secondary Education" } },
  { name: "Tripura", code: "TR", type: "STATE", board: { shortName: "TBSE", name: "Tripura Board of Secondary Education" } },
  { name: "Uttar Pradesh", code: "UP", type: "STATE", board: { shortName: "UPMSP", name: "Uttar Pradesh Madhyamik Shiksha Parishad" } },
  { name: "Uttarakhand", code: "UK", type: "STATE", board: { shortName: "UBSE", name: "Uttarakhand Board of School Education" } },
  { name: "West Bengal", code: "WB", type: "STATE", board: { shortName: "WBBSE", name: "West Bengal Board of Secondary Education" } },
  // Union Territories - most run on CBSE rather than a dedicated board;
  // J&K and Puducherry are the notable exceptions with their own boards.
  { name: "Delhi", code: "DL", type: "UNION_TERRITORY" },
  { name: "Jammu and Kashmir", code: "JK", type: "UNION_TERRITORY", board: { shortName: "JKBOSE", name: "Jammu and Kashmir Board of School Education" } },
  { name: "Ladakh", code: "LA", type: "UNION_TERRITORY" },
  { name: "Puducherry", code: "PY", type: "UNION_TERRITORY", board: { shortName: "DSE Puducherry", name: "Directorate of School Education, Puducherry" } },
  { name: "Chandigarh", code: "CH", type: "UNION_TERRITORY" },
  { name: "Andaman and Nicobar Islands", code: "AN", type: "UNION_TERRITORY" },
  { name: "Dadra and Nagar Haveli and Daman and Diu", code: "DN", type: "UNION_TERRITORY" },
  { name: "Lakshadweep", code: "LD", type: "UNION_TERRITORY" },
];

const CORE_SUBJECTS = [
  { name: "Mathematics", slug: "mathematics", icon: "Sigma", colorToken: "indigo" },
  { name: "Science", slug: "science", icon: "FlaskConical", colorToken: "emerald" },
  { name: "English", slug: "english", icon: "BookOpen", colorToken: "sky" },
  { name: "Social Science", slug: "social-science", icon: "Globe2", colorToken: "amber" },
  { name: "Hindi", slug: "hindi", icon: "Languages", colorToken: "rose" },
  { name: "Computer Science", slug: "computer-science", icon: "Code2", colorToken: "violet" },
];

const ACHIEVEMENTS = [
  { key: "streak-7", title: "7-Day Streak", description: "Studied 7 days in a row.", icon: "Flame", category: "streak" },
  { key: "streak-30", title: "30-Day Streak", description: "Studied 30 days in a row.", icon: "Flame", category: "streak" },
  { key: "first-lesson", title: "First Steps", description: "Completed your first lesson.", icon: "Footprints", category: "milestone" },
  { key: "mastery-bronze", title: "Bronze Mastery", description: "Reached 50% mastery in a topic.", icon: "Medal", category: "mastery" },
  { key: "mastery-gold", title: "Gold Mastery", description: "Reached 90% mastery in a topic.", icon: "Trophy", category: "mastery" },
  { key: "practice-50", title: "Practice Makes Perfect", description: "Answered 50 practice questions.", icon: "ListChecks", category: "practice" },
];

const SYSTEM_SETTINGS = [
  { key: "maintenance", label: "Maintenance mode", description: "Temporarily block student logins for deployments", enabled: false },
  { key: "signups", label: "Allow new signups", description: "Let new students/parents/teachers register", enabled: true },
  { key: "ai-tutor", label: "AI Tutor Chat enabled platform-wide", description: "Master switch for the Socratic tutor feature", enabled: true },
  { key: "leaderboards", label: "Class leaderboards", description: "Enable the optional leaderboard feature for all students", enabled: true },
];

async function main() {
  console.log("Seeding States + Union Territories...");
  const stateByCode = new Map<string, string>(); // code -> State.id
  for (const s of STATES) {
    const state = await prisma.state.upsert({
      where: { code: s.code },
      update: { name: s.name, type: s.type as RegionType },
      create: { name: s.name, code: s.code, type: s.type as RegionType },
    });
    stateByCode.set(s.code, state.id);
  }

  console.log("Seeding national boards (CBSE, CISCE, NIOS)...");
  const nationalBoardIds: string[] = [];
  for (const b of NATIONAL_BOARDS) {
    const board = await prisma.board.upsert({
      where: { shortName: b.shortName },
      update: { name: b.name, type: BoardType.NATIONAL },
      create: { name: b.name, shortName: b.shortName, type: BoardType.NATIONAL },
    });
    nationalBoardIds.push(board.id);
  }

  console.log("Seeding state boards...");
  for (const s of STATES) {
    if (!s.board) continue;
    const stateId = stateByCode.get(s.code)!;
    await prisma.board.upsert({
      where: { shortName: s.board.shortName },
      update: { name: s.board.name, type: BoardType.STATE, stateId },
      create: { name: s.board.name, shortName: s.board.shortName, type: BoardType.STATE, stateId },
    });
  }

  console.log("Seeding Class 1-10 for national boards...");
  const schoolClassIdsByBoard = new Map<string, string[]>();
  for (const boardId of nationalBoardIds) {
    const ids: string[] = [];
    for (let grade = 1; grade <= 10; grade++) {
      const sc = await prisma.schoolClass.upsert({
        where: { boardId_grade: { boardId, grade } },
        update: { label: `Class ${grade}` },
        create: { boardId, grade, label: `Class ${grade}` },
      });
      ids.push(sc.id);
    }
    schoolClassIdsByBoard.set(boardId, ids);
  }

  console.log("Seeding core subjects...");
  // Not using upsert here: Subject's compound unique key (slug, boardId,
  // grade) includes two nullable columns, and Postgres treats NULL != NULL
  // in unique indexes - an upsert keyed on nulls would never match an
  // existing row and would insert a duplicate on every re-run. These core
  // subjects are intentionally generic (boardId/grade = null), so look them
  // up by slug among the generic rows instead.
  const subjectIds: string[] = [];
  for (const subj of CORE_SUBJECTS) {
    const existing = await prisma.subject.findFirst({
      where: { slug: subj.slug, boardId: null, grade: null },
    });
    const subject = existing
      ? await prisma.subject.update({
          where: { id: existing.id },
          data: { name: subj.name, icon: subj.icon, colorToken: subj.colorToken },
        })
      : await prisma.subject.create({
          data: { name: subj.name, slug: subj.slug, icon: subj.icon, colorToken: subj.colorToken },
        });
    subjectIds.push(subject.id);
  }

  console.log("Linking core subjects to national-board classes...");
  for (const ids of schoolClassIdsByBoard.values()) {
    for (const schoolClassId of ids) {
      for (const subjectId of subjectIds) {
        await prisma.schoolClassSubject.upsert({
          where: { schoolClassId_subjectId: { schoolClassId, subjectId } },
          update: {},
          create: { schoolClassId, subjectId },
        });
      }
    }
  }

  console.log("Seeding achievement catalog...");
  for (const a of ACHIEVEMENTS) {
    await prisma.achievement.upsert({
      where: { key: a.key },
      update: { title: a.title, description: a.description, icon: a.icon, category: a.category },
      create: a,
    });
  }

  console.log("Seeding default system settings...");
  for (const s of SYSTEM_SETTINGS) {
    await prisma.systemSetting.upsert({
      where: { key: s.key },
      update: { label: s.label, description: s.description },
      create: s,
    });
  }

  // ---------------------------------------------------------------------
  // Demo accounts (Stage B). Same usernames/passwords as the fallback
  // list in lib/auth/users.ts, so nothing changes for anyone using these
  // credentials once DATABASE_URL is set - login just starts authenticating
  // them against real, bcrypt-hashed rows instead of the hardcoded array.
  // Passwords are overridable via the same env vars documented in
  // .env.example / docs/DEMO_CREDENTIALS.md; never real production
  // credentials, and never committed anywhere in plaintext.
  // ---------------------------------------------------------------------
  console.log("Seeding demo school...");
  const demoSchool = await prisma.school.upsert({
    where: { id: "demo-school" },
    update: {},
    create: { id: "demo-school", name: "TeachAI Demo School" },
  });

  const cbseBoardId = nationalBoardIds[0]; // NATIONAL_BOARDS[0] = CBSE
  const cbseClassIds = schoolClassIdsByBoard.get(cbseBoardId)!; // index 0 = Class 1 ... index 9 = Class 10
  const mathSubjectId = subjectIds[CORE_SUBJECTS.findIndex((s) => s.slug === "mathematics")];
  const scienceSubjectId = subjectIds[CORE_SUBJECTS.findIndex((s) => s.slug === "science")];

  console.log("Seeding demo admin account...");
  const adminPassword = process.env.ADMIN_PASSWORD || "Admin@123";
  const adminUser = await prisma.user.upsert({
    where: { username: "admin" },
    update: { passwordHash: await hashPassword(adminPassword) },
    create: {
      username: "admin",
      email: "admin@teachai.local",
      passwordHash: await hashPassword(adminPassword),
      name: "Srinidhi",
      role: Role.ADMIN,
    },
  });
  await prisma.admin.upsert({
    where: { userId: adminUser.id },
    update: {},
    create: { userId: adminUser.id },
  });

  console.log("Seeding demo teacher account...");
  const teacherPassword = process.env.TEACHER_PASSWORD || "Teacher@123";
  const teacherUser = await prisma.user.upsert({
    where: { username: "teacher" },
    update: { passwordHash: await hashPassword(teacherPassword) },
    create: {
      username: "teacher",
      email: "teacher@teachai.local",
      passwordHash: await hashPassword(teacherPassword),
      name: "Teacher",
      role: Role.TEACHER,
    },
  });
  const teacherProfile = await prisma.teacher.upsert({
    where: { userId: teacherUser.id },
    update: { schoolId: demoSchool.id },
    create: { userId: teacherUser.id, schoolId: demoSchool.id },
  });
  // Matches the fallback account's assignedClasses ["Class 8","Class 9","Class 10"] x subjects ["Mathematics","Science"]
  for (const grade of [8, 9, 10]) {
    const schoolClassId = cbseClassIds[grade - 1];
    for (const subjectId of [mathSubjectId, scienceSubjectId]) {
      await prisma.teacherAssignment.upsert({
        where: { teacherId_schoolClassId_subjectId: { teacherId: teacherProfile.id, schoolClassId, subjectId } },
        update: {},
        create: { teacherId: teacherProfile.id, schoolClassId, subjectId },
      });
    }
  }

  console.log("Seeding demo student accounts...");
  const studentGrades = [6, 7, 8, 9, 10]; // student1 -> Class 6 ... student5 -> Class 10
  for (let i = 0; i < studentGrades.length; i++) {
    const n = i + 1;
    const grade = studentGrades[i];
    const envKey = `STUDENT${n}_PASSWORD`;
    const password = process.env[envKey] || "Student@123";
    const username = `student${n}`;
    const studentUser = await prisma.user.upsert({
      where: { username },
      update: { passwordHash: await hashPassword(password) },
      create: {
        username,
        email: `${username}@teachai.local`,
        passwordHash: await hashPassword(password),
        name: `Student ${n}`,
        role: Role.STUDENT,
      },
    });
    await prisma.student.upsert({
      where: { userId: studentUser.id },
      update: { schoolId: demoSchool.id, boardId: cbseBoardId, schoolClassId: cbseClassIds[grade - 1] },
      create: {
        userId: studentUser.id,
        schoolId: demoSchool.id,
        boardId: cbseBoardId,
        schoolClassId: cbseClassIds[grade - 1],
        // Legacy self-serve fields (pre-existing onboarding flow) - kept
        // populated so the old /onboarding-driven pages still have data.
        grade: `Class ${grade}`,
        gradeStage: grade <= 5 ? "PRIMARY" : grade <= 8 ? "MIDDLE_SCHOOL" : "HIGH_SCHOOL",
        curriculum: "CBSE",
      },
    });
  }

  console.log("Seed complete.");
  console.log(`  States/UTs: ${STATES.length}`);
  console.log(`  National boards: ${NATIONAL_BOARDS.length}`);
  console.log(`  State boards: ${STATES.filter((s) => s.board).length}`);
  console.log(`  Classes seeded (national boards only, Class 1-10 each): ${NATIONAL_BOARDS.length * 10}`);
  console.log(`  Core subjects: ${CORE_SUBJECTS.length}`);
  console.log("  Demo accounts: 1 admin, 1 teacher, 5 students (see docs/DEMO_CREDENTIALS.md)");
  console.log("  Note: additional state-board classes are enabled via Admin > Board & Classes (Stage C), not pre-seeded here.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
