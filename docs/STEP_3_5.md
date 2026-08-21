# Step 3-5 Migration: Status

TeachAI is being evolved from the mock-data + demo-auth build (Step 1/2,
`a92ccc2`) into a real full-stack app, one reviewed stage at a time. Each
stage is implemented, tested, and reported before the next one starts - no
stage is applied to `main`/production without an explicit go-ahead.

**Provider decisions already made (by you, before Stage A started):**
- Database: **Vercel Postgres**
- AI Tutor: **provider-agnostic abstraction now, mocked responses** until a
  real key is supplied (Stage G)
- File storage: **Vercel Blob**

## Stage status

| Stage | Scope | Status |
|---|---|---|
| A | Database + Prisma | **Code complete and reviewed, not yet connected.** Schema written, validated, client generates; seed script written; a full correctness/security review pass found and fixed several real issues (see "Stage A review" below). **Database NOT connected. No migrations executed. No production database provisioned.** Needs a real `DATABASE_URL`/`DIRECT_URL` from you to run `db:migrate`/`db:seed` for the first time - I have not asked for or been given one. Committed: `c8815ea`. |
| B | Real users/auth | **Code complete, locally validated where possible, not yet connected.** Bcrypt hashing, DB-backed login, session/middleware, tamper-rejection all implemented and tested (see "Stage B detail" below) - but the actual database query path has never executed against a live Postgres instance. Same DB-connection blocker as Stage A. |
| C | Admin persistence (Board & Classes, Users, Study Materials, Exam Schedule) | Not started |
| D | Teacher persistence (worksheets, exams, grading, student progress) | Not started |
| E | Student persistence (subjects, textbook, learning path, planner) | Not started |
| F | Exams/evaluation (online exam flow, auto + manual grading) | Not started |
| G | AI tutor (provider abstraction + real provider wiring) | Not started |
| H | Analytics (notifications, audit logs, dashboards) | Not started |
| I | Production hardening (validation, rate limiting, loading/error/empty states, a11y, mobile polish) | Not started |

## Stage A detail

**Delivered:**
- `prisma/schema.prisma` - full relational model covering every entity
  listed in the spec (User/Student/Teacher/Admin, State/Board/School,
  SchoolClass [Class 1-10]/Subject/Chapter/Topic, TeacherAssignment,
  ClassSection, StudyMaterial/Worksheet, the self-practice engine
  (Question/Paper/Attempt/Score - pre-existing) alongside the new formal
  Exam/ExamQuestion/ExamSubmission/ExamAnswer/Grade pipeline, ExamSchedule,
  StudentSubjectProgress/StudentTopicProgress, WeaknessProfile +
  StrengthProfile, Achievement, StudyPlan/StudyPlanItem (= "Learning Path"),
  DailyPlannerTask, CalendarEvent, AIConversation/AIMessage, Notification,
  AuditLog, PromptTemplate, SystemSetting). See the schema's inline comments
  for naming/consolidation decisions (e.g. why the old `Class` model was
  renamed `ClassSection`).
- `prisma/seed.ts` - seeds all 28 Indian states + 8 union territories, all
  3 national boards + every state's own board (see `docs/BOARDS.md`),
  Class 1-10 for the national boards, a starter subject catalog, the
  achievement catalog, and default system settings. Deliberately does
  **not** seed user accounts (needs Stage B's password hashing).
- `lib/prisma.ts` - the Prisma Client singleton, following Prisma's
  documented Next.js hot-reload-safe pattern. Not imported by any page yet.
- Tooling: `npm run db:generate|db:migrate|db:deploy|db:seed|db:studio`,
  plus a `postinstall: prisma generate` hook so Vercel's build always has a
  fresh client (verified this doesn't require `DATABASE_URL` to be set -
  it's safe on the current deployment as-is).
- Pinned Prisma to 6.x rather than the just-released 7.x, which dropped the
  classic connection-string datasource in favor of a required
  provider-specific driver adapter - unnecessary complexity for this stage.
- Fixed a real correctness bug before it could ship: `Board`'s original
  `@@unique([shortName, stateId])` would have silently duplicated the 3
  national boards on every re-seed, because Postgres treats `NULL != NULL`
  in unique indexes and national boards have `stateId = null`. Simplified
  to a plain `shortName @unique`.

**Verified:** `prisma validate`, `prisma generate`, `npx tsc --noEmit`,
`npm run lint`, `npm run build` all pass. Manually re-verified in a running
dev server after the review pass: `/`, `/login`, student/teacher/admin
login, `/dashboard`, `/teacher`, `/admin` all render correctly, and
cross-role route protection (student blocked from `/admin` and `/teacher`)
still works. The deployed app is unaffected - no page imports Prisma yet.

**Blocked on you for the "connect it" half of Stage A:** provisioning the
actual Vercel Postgres database and providing `DATABASE_URL`/`DIRECT_URL`
(see `docs/DATABASE.md`). Until then this is reviewable, tested code - not
a live database.

## Stage A review (hardening pass before Stage B)

A dedicated review pass checked the schema for incorrect relations, missing
indexes/foreign keys, bad cascade behavior, unique-constraint bugs, and
Vercel/Prisma/Postgres compatibility. Real issues found and fixed:

- **Missing indexes on ~20 foreign-key columns.** Prisma/Postgres do not
  auto-index a plain relation scalar field unless it's part of a
  `@unique`/`@@unique` - every "get this student's X" / "get materials for
  this class" style query (Student, StudyMaterial, Worksheet, Exam,
  ExamSchedule, CalendarEvent, DailyGoal, DailyPlannerTask, Notification,
  AuditLog, Assignment, AIConversation, ExamSubmission, WorksheetSubmission,
  ParentStudentLink, TeacherAssignment, Subject, Board) was missing one.
  Added `@@index`/`@@index([...])` across all of them.
- **Dangerous cascade deletes on the config tier.** `State -> Board`,
  `Board -> SchoolClass`, `SchoolClass -> ClassSection`, and
  `Board/SchoolClass -> ExamSchedule` were all `onDelete: Cascade`. Deleting
  one State or Board could have silently wiped every downstream class,
  roster, enrollment, material, and exam under it. Changed to
  `onDelete: Restrict` - boards/states are meant to be soft-disabled
  (`isEnabled = false`), and a genuine hard delete should now fail loudly
  and force explicit cleanup instead of cascading silently.
- **Two missing foreign keys.** `ExamSchedule.createdByUserId` and
  `StudyMaterial.uploadedByUserId` were plain `String` fields, not real
  relations - now proper nullable `User` relations with `onDelete: SetNull`.
- **One redundant field.** `Grade.gradedByUserId` duplicated information
  already available via `Grade.teacherId -> Teacher.user` - removed rather
  than risk the two drifting out of sync.
- **A second instance of the NULL-uniqueness bug** (same class as the
  `Board.shortName` fix from the first Stage A pass): `Subject`'s
  `@@unique([slug, boardId, grade])` doesn't protect the generic/shared
  subject catalog (`boardId`/`grade` both null) at the database level,
  since Postgres treats `NULL != NULL` in unique indexes. Documented the
  caveat directly in the schema; `prisma/seed.ts` already handles this
  correctly (find-then-create instead of upsert), and any future code
  creating generic subjects must follow the same pattern.
- **`lib/prisma.ts` hardened against accidental client-bundle exposure.**
  Added `import "server-only"` - if this module (or anything importing it)
  ever ends up in a Client Component bundle, the build now fails loudly
  instead of silently shipping Prisma's Node-only code toward the browser.

**Reviewed, no change needed:** enum designs (one judgment call kept as-is:
`ExamStatus` has both `DRAFT` and `UNPUBLISHED` - intentional, matches the
spec's explicit Publish/Unpublish actions as distinct from "never
published"); the Board/State architecture already supports multiple boards
per state and UT-specific boards (nothing assumes one-state-one-board - see
`docs/BOARDS.md`); the Board -> SchoolClass -> Subject -> Chapter -> Topic
hierarchy chain is complete and data-driven (no hard-coded per-class
pages); no plaintext secrets or hardcoded credentials found anywhere in the
schema/seed/tooling.

**Left as an accepted trade-off, not fixed:** `Teacher`-rooted cascades
(deleting a Teacher cascades to their ClassSections, StudyMaterials,
Worksheets, Exams, Grades, TeacherAssignments) remain `Cascade`. Unlike the
State/Board tier, a Teacher delete's blast radius is contained to that one
teacher's own data, and `User.isActive` already exists as the intended
soft-delete path for the routine case - a hard delete cascading through one
teacher's own records is a reasonable, bounded outcome for the rare case.

## Next.js security update (applied)

The previous review found a **critical** severity `npm audit` finding in
the pinned `next@14.2.5` (multiple CVEs) - pre-existing from the original
Step 1/2 build. Checked available versions and upgraded to **14.2.35**, the
newest stable release in the 14.x line (confirmed via `npm view next
versions` - stayed strictly within 14.x, no 15/16 jump). Result: the
critical-severity finding is resolved. `npm audit` still reports 14
high-severity findings tied to the `next` package, but `npm audit fix
--force` confirms these are only patched starting at `next@16.3.2` - they
cannot be resolved while staying on Next.js 14, which was an explicit
constraint. This is the safest achievable state within that constraint.
Lint/typecheck/build/manual route testing all re-verified clean after the
upgrade.

## Stage B detail

**Delivered:**
- `lib/auth/password.ts` - bcrypt hash/verify (12 salt rounds), `server-only`-guarded.
- `prisma/schema.prisma` - added `User.username` (the login form is
  username-based, not email-based, to preserve the existing UI - the
  schema didn't have this field before).
- `lib/auth/users.ts` - rewritten. `findUser()` is now async and picks one
  of two paths automatically: a real Prisma/bcrypt lookup against the
  `User` table when `DATABASE_URL` is set, or a fallback to the same 7
  hardcoded demo accounts (unchanged from Step 1/2) when it's unset. See
  "Why a fallback, not a hard cutover" below for the reasoning. The client
  never controls the session's role - it always comes from the matched
  account record (`user.role`), whichever path resolved it.
- `prisma/seed.ts` - now also seeds a demo School and the 7 demo accounts
  as real `User`/`Student`/`Teacher`/`Admin`/`TeacherAssignment` rows with
  bcrypt-hashed passwords, matching the fallback list's usernames/passwords
  exactly.
- `app/api/auth/login/route.ts` - awaits the now-async `findUser()`; no
  other change needed (session signing, cookie flags were already correct
  from Step 1).

**Why a fallback, not a hard cutover:** the live Vercel deployment
(`https://maiteacher.vercel.app/`) is running today with no database
connected. If `findUser()` only queried Prisma, every login attempt on the
live site would start failing the moment this code ships, regardless of
whether it's pushed - there is no database for it to query yet. The
fallback keeps the live site (and local dev) working exactly as before;
the moment `DATABASE_URL` is set in an environment, that environment
automatically starts using real, bcrypt-verified database rows instead -
no further code change needed. This is a deliberate safety design, not a
shortcut: **do not push this Stage B code to `main`/production until
`DATABASE_URL`/`DIRECT_URL` are set in Vercel and `npm run db:seed` has
been run** - see the final report for why.

**Verified (real tests, no live database required):**
- Bcrypt hash/verify round-trip (hash format, correct-password accept,
  wrong-password reject, salting produces different hashes each time) - 4/4 pass.
- HMAC session sign/verify logic (legitimate token accepted, forged token
  rejected, tampered/role-escalated token rejected via signature mismatch,
  empty/malformed tokens rejected) - 5/5 pass.
- Full HTTP login -> session -> middleware -> logout flow in a running dev
  server, exercised through the fallback path (same route handler,
  session, and middleware code every path uses): admin/teacher/student
  login, wrong-password rejection (401), session persistence across
  reload, logout invalidation, and cross-role blocks (student blocked
  from `/admin`; teacher blocked from `/admin`; admin blocked from
  `/teacher`) - all confirmed working.
- `prisma/seed.ts` dry-run against an unreachable database: confirmed the
  script imports cleanly and runs correctly through all seeding logic up
  to the first real network call, which fails with a clean "can't reach
  database server" error - not a code defect.
- `npm run lint`, `npx tsc --noEmit`, `npm run build`, `prisma validate`,
  `prisma generate` all pass.

**Implemented but awaiting a real database connection (not executed):**
`findUserInDatabase()`'s actual Prisma query, and `prisma/seed.ts`'s actual
writes - both type-check correctly against the generated client but have
never run against live Postgres.

**Not implemented (out of Stage B's scope, deferred):**
- The state -> board -> class onboarding flow mentioned in the spec
  (section 8) needs the board-hierarchy picker UI that doesn't exist until
  Stage E (Student Portal) - building it now would mean building it twice.
- Admin-facing password reset / account creation UI - that's Stage C
  (Admin > Users). The hashing primitive (`hashPassword()`) it will call
  already exists.
- A session-revocation list (server-side "kill this specific session
  early" beyond waiting for the 7-day expiry or clearing the cookie via
  logout) - the signed-cookie design is inherently stateless; adding
  revocation would need a `Session` table and is more infrastructure than
  a "production-ready authentication foundation" requires at this stage.
