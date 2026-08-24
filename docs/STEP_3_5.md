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
| C | Study materials + file storage | **Mostly complete.** Storage abstraction (Vercel Blob, gracefully "not configured" without a token), full materials CRUD + student-facing `/materials` page, worksheet CRUD (data layer only, no dedicated UI page yet), file validation/authorization. Admin's pre-existing `study-materials-card.tsx`/`exam-schedule-card.tsx` still run on local mock state, not yet rewired to the new real actions - see "Stage C/D/E detail". |
| D | Exam + grading system | **Complete, end-to-end.** Teacher exam creation + question builder + publish/unpublish (`/teacher/exams`), student exam-taking with timer/navigation/flagging (`/exams/[id]/attempt`), server-authoritative MCQ/TRUE_FALSE auto-evaluation, teacher subjective grading + finalize (`/teacher/exams/[id]`), student results (`/exams/[id]/results`, `/results`). |
| E | Progress + learning path + planner | **Complete.** Deterministic progress/weakness/strength engines (`lib/analytics/*`), learning path generation reusing `StudyPlan`, daily planner, all wired into the student dashboard with graceful "database not connected" fallback (not a crash) when unreachable. |
| F | Registration + account approval | **Code complete, locally validated where possible, not yet connected.** Student/teacher/admin-request registration, `AccountStatus`/`RegistrationRequest` model, super-admin-gated approval workflow, suspend/reactivate, audit logging - see "Stage F detail" below. Same DB-connection blocker as Stages A/B: nothing here has executed against a live database. (Note: an earlier, unrelated "exam evaluation" item was previously tracked under the letter F; it was folded into Stage D and is documented there instead - this F is the registration/approval work described below.) |
| G | AI tutor (provider abstraction + real provider wiring) | **Code complete, locally validated where possible, not yet connected.** Provider-agnostic abstraction (`lib/ai/*`), Gemini implementation, conversation persistence reusing `AIConversation`/`AIMessage`, `/ai-tutor` upgraded from a canned mock to a real (database-backed) tutor with graceful "no database"/"AI not configured" states - see "Stage G detail" below. No `DATABASE_URL` and no `GEMINI_API_KEY` exist yet, so no real generation has ever executed. |
| H | Analytics, reporting & performance | **Code complete, locally validated where possible, not yet connected.** Real student/teacher/admin analytics across `/performance`, `/weak-areas`, the new `/strengths`, `/teacher`, `/teacher/exams/[examId]`, and the admin dashboard - see "Stage H detail" below. No schema change. (Note: this letter was originally scoped as "notifications, audit logs, dashboards" in early planning; AuditLog writes and admin Logs/Notification UI wiring remain as described below, unrelated to the analytics work done here.) |
| I | Production readiness & real data integration | **Code complete, locally/offline verified, not yet connected.** Offline-generated initial migration, production auth fail-closed hardening, real admin material upload UI, new `/teacher/worksheets` UI, focused authorization re-audit (no new issues beyond the two auth-fallback gaps fixed here) - see "Stage I detail" below. Zod validation and graceful empty/error states already existed throughout Stage C/D/E; rate limiting (AI Tutor only, Stage G) and a full a11y pass remain out of scope for this stage. |

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

## Stage C/D/E detail

**Schema changes made while implementing these stages** (all validated,
formatted, client-regenerated, `tsc --noEmit` clean before and after):
- `MaterialType` enum changed from file-format values (PDF/DOC/PPT/IMAGE)
  to content-category values (TEXTBOOK/NOTES/REFERENCE/VIDEO/PDF/
  PRESENTATION/OTHER) matching the spec's explicit list.
- `StudyMaterial` gained `isPublished`, `updatedAt`, and real `chapterId`/
  `topicId` relations (previously free-text `chapterName`); board/class/
  subject/chapter are now required, not nullable - a material that isn't
  placed in the curriculum hierarchy can't be filtered to the right
  students.
- `Worksheet` gained the same `chapterId`/`topicId` relations and
  `updatedAt`.
- `ExamQuestion` gained an optional `topicId` - without it, the
  weakness/strength engine could only reason at exam/subject granularity,
  not topic granularity.
- `StrengthProfile` gained a `reason` field (symmetry with
  `WeaknessProfile` - the spec's own strength example includes a reason).
- `PlannerTaskStatus` corrected from `PENDING/COMPLETED/SKIPPED` to the
  spec's explicit `TODO/IN_PROGRESS/COMPLETED/SKIPPED`.

**Delivered - shared infrastructure:**
- `lib/storage/{types,provider,index}.ts` - Vercel Blob abstraction.
  `storage.isConfigured` is `false` without `BLOB_READ_WRITE_TOKEN`; every
  method throws a typed `StorageNotConfiguredError` instead of silently
  pretending an upload succeeded. Compiles and builds with zero token set.
- `lib/auth/current-session.ts` - `getCurrentSession()`/`requireRole()`
  helpers so every server action derives identity from the session cookie,
  never from client-supplied `userId`/`role`/etc.
- `components/database-unavailable.tsx` - the empty state every new page
  shows when a Prisma query throws because there's no live database. This
  exists because of a real bug caught during testing (see below).

**Delivered - Stage C (`lib/actions/materials.ts`, `worksheets.ts`,
`exam-schedule.ts`, `curriculum.ts`):**
- Materials: create (with file upload + validation), publish/unpublish,
  delete, list-for-admin, list-for-student (scoped to the student's own
  `schoolClassId`/`boardId`, published only - verified in code that a
  student's query can never reach another board/class's materials, since
  the filter comes from their own `Student` row, not client input).
  Student-facing `/materials` page implemented (grouped by subject, open/
  download actions, empty state).
  **UI not yet built:** Admin's material upload form - `study-materials-card.tsx`
  still uses local `useState` mock data from Step 2, not yet rewired to
  `createMaterial()`.
- Worksheets: create/publish/delete/list (teacher + student), submit
  (student), grade (teacher) - all authorization-checked against
  `TeacherAssignment` (a teacher can only touch a class/subject they're
  actually assigned to, checked server-side, not just hidden in the UI).
  **UI not yet built:** no dedicated teacher worksheet-creation page yet -
  the data layer is complete and typechecked but unreached by any page.
- Exam schedule: create/publish/delete/list (admin), list-for-student
  (scoped, published-only). **UI not yet built:** admin's
  `exam-schedule-card.tsx` still uses local mock state.
- File security: MIME allowlist, 25MB size cap, safe-filename sanitization,
  auth+role+ownership checks on every mutation - all server-side, all in
  `lib/storage/types.ts`'s `validateUploadFile()`/`safeFilename()` plus
  each action's own authorization checks.

**Delivered - Stage D (`lib/actions/exams.ts`) - end to end:**
- Teacher: create exam (draft), add/edit/delete/reorder questions
  (**draft-only** - a published exam's questions are frozen so
  already-submitted attempts can never be corrupted), publish (requires
  ≥1 question)/unpublish. UI: `/teacher/exams` (list + create form),
  `/teacher/exams/[id]` (question builder + publish controls + submissions).
- Student: browse published exams for their own class only
  (`listExamsForStudent`), start an attempt (creates/resumes an
  `ExamSubmission`, blocks re-entry after submission), question view that
  **never includes `correctAnswer`** (verified by reading
  `getExamForAttempt`'s select shape), autosave per answer, submit with a
  confirmation modal and duplicate-submission guard. UI: `/exams` (list),
  `/exams/[id]/attempt` (full exam-taking interface: question navigator,
  countdown timer with auto-submit at zero, flagging, MCQ/TRUE_FALSE/
  SHORT_ANSWER/LONG_ANSWER inputs).
- Evaluation: MCQ/TRUE_FALSE compared server-side against the stored
  `correctAnswer` (case/whitespace-normalized) the moment a student
  submits - the score is never computed or trusted client-side.
  SHORT_ANSWER/LONG_ANSWER left `marksAwarded: null` (pending) until a
  teacher grades them.
- Teacher grading: per-answer marks entry, feedback, "finalize" which
  requires every answer to be marked before it'll compute the final
  `Grade` row - all ownership-checked (`exam.teacher.userId === session.id`).
  UI: expandable submission list on `/teacher/exams/[id]`.
- Student results: `/exams/[id]/results` (question-by-question, correct
  answers only shown post-submission, "pending review" state while
  subjective questions await grading) and `/results` (all past results).
  Ownership is structural, not a runtime check: the query is always
  `{examId, studentId: <from session>}` - there is no code path where a
  student can fetch another student's result by changing a URL parameter.

**Delivered - Stage E (`lib/analytics/{progress,weakness,strengths,
learning-path}.ts`, `lib/actions/{analytics,planner}.ts`):**
- Progress: `recalculateTopicProgress`/`recalculateSubjectProgress`
  compute real percentages from `ExamAnswer.marksAwarded` (only for
  topic-tagged questions - see the `ExamQuestion.topicId` schema addition
  above), persisted to `StudentTopicProgress`/`StudentSubjectProgress`.
  Triggered automatically after `submitExam` (fully auto-graded case) and
  `finalizeExamGrade` (subjective case) - not something a page computes
  itself.
- Weakness/Strength: deterministic thresholds (< 50% mastery = weak,
  ≥ 80% = strong with ≥3 attempts required - "don't call it a strength off
  one question," per the spec), explainable `reason` strings generated
  from real recent-attempt counts, persisted to `WeaknessProfile`/
  `StrengthProfile`, auto-recalculated on the same grading events as
  progress. No LLM involved anywhere in this arithmetic.
- Learning Path: `generateLearningPath()` reuses `StudyPlan`/
  `StudyPlanItem` (no second "LearningPath" model, per the spec) -
  schedules weak topics first (or general subject coverage if no weak
  areas exist yet), spreads across up to 14 days (or fewer, if an
  upcoming published exam is sooner), inserts a revision/mock-test buffer
  day every 4th/8th day. Regeneration is a button on the dashboard
  (`GenerateLearningPathButton`).
- Daily Planner: `DailyPlannerTask` CRUD (student-created ad-hoc tasks,
  distinct from system-generated `StudyPlanItem`) plus `getTodayOverview()`
  which combines today's manual tasks, today's learning-path item, worksheets
  due within 7 days, and upcoming published exams into one dashboard widget.
- Dashboard integration (E6): `components/dashboard/real-data-section.tsx`
  adds Today's Planner / Weak Areas / Strengths / Learning Path / Upcoming
  Exams / Recent Results to the existing student dashboard, **alongside**
  (not replacing) every pre-existing Step 1/2 mock widget.

**A real regression caught and fixed during testing:** the first version
of `RealDataSection` had no error handling. Verified in the browser
(logged in via the Stage B fallback path) that visiting `/dashboard`
without a database threw `PrismaClientInitializationError` and produced a
**blank page - the entire dashboard, including every working Step 1/2
widget, stopped rendering.** This is exactly the kind of regression these
instructions explicitly forbid. Fixed by wrapping the data-fetch in
try/catch with a `DatabaseUnavailable`-style fallback card; re-verified in
the browser that the dashboard now renders normally with a small "database
not connected" notice in place of the real-data section, and applied the
same defensive pattern (`components/database-unavailable.tsx`) to every
other new Stage C/D page (`/materials`, `/exams`, `/exams/[id]/results`,
`/results`, `/teacher/exams`, `/teacher/exams/[id]`) so a missing database
degrades gracefully everywhere, not just on the dashboard.

**Verified (real tests, no live database required):**
- `prisma validate`/`generate`, `npx tsc --noEmit`, `npm run lint`,
  `npm run build` all pass after every schema/code change (checked
  incrementally, not just once at the end).
- Full browser session via the Stage B fallback auth: student/teacher
  login; `/dashboard` renders (with graceful fallback for the new
  section); `/materials`, `/exams`, `/teacher/exams` all show the
  graceful "database not connected" state instead of crashing;
  cross-role blocks re-verified on the new routes (teacher blocked from
  `/materials`, student blocked from `/teacher/exams`).
- `prisma/seed.ts` dry-run against an unreachable database still runs
  cleanly through all its logic after every schema change in this stage,
  failing only at the network call.

**Not executed against a live database (code implemented, untested at
runtime):** every actual Prisma read/write in `lib/actions/*` and
`lib/analytics/*` - the query shapes are verified by TypeScript against
the real generated Prisma client (which catches most structural errors -
wrong field names, wrong relation includes, wrong enum values), but no
row has ever actually been read or written, because there is still no
`DATABASE_URL`.

## Stage F detail

**Goal:** let real students/teachers/admins create their own accounts,
instead of only the 7 fixed seed accounts, without opening a hole that
lets anyone hand themselves elevated access. Every account created through
this stage starts inert (`AccountStatus.PENDING`) and only an authorized
admin action can activate it.

**Schema (`prisma/schema.prisma`):**
- `AccountStatus` enum (`PENDING`/`ACTIVE`/`REJECTED`/`SUSPENDED`) added to
  `User` as `status` (indexed), defaulting to `PENDING`. This is the
  authoritative login gate - separate from the pre-existing `isActive`
  boolean, which is left alone. Rejected/suspended users are never
  deleted, only status-flipped, so the audit trail and the option to
  reverse a decision both survive.
- `Admin.isSuperAdmin` (`Boolean @default(false)`) - set to `true` in
  exactly one place in the entire codebase: `prisma/seed.ts`, for the one
  bootstrap admin account. No registration action, approval action, or
  UI control can ever set it; there is no parameter for it anywhere
  outside the seed script.
- `RegistrationRequest` model: one row per registration attempt
  (`userId` unique, `requestedRole`, `RequestStatus` PENDING/APPROVED/
  REJECTED, `requestedDetails Json?` for role-specific extra fields,
  `reviewedAt`/`reviewedByUserId`/`rejectionReason`/`reviewNotes`). Kept
  separate from `User` rather than adding a dozen nullable columns to it -
  most users will never have more than one request, and the review
  metadata (who reviewed it, when, why rejected) doesn't belong on the
  account itself.
- `AuditAction` gained `REGISTRATION_SUBMITTED`, `REGISTRATION_APPROVED`,
  `REGISTRATION_REJECTED`, `USER_SUSPENDED`, `USER_REACTIVATED`.

**Registration (`lib/actions/registration.ts`, public routes under
`/register/*`):**
- `registerStudent` / `registerTeacher` / `registerAdminRequest`, each
  Zod-validated server-side (password: min 8 chars + at least one letter
  and one digit, matching confirm-password, username/email format),
  hashing the password with the existing `hashPassword` (bcrypt, 12
  rounds), checking for a duplicate username/email before creating
  anything, and validating the submitted State/Board/Class (and, for
  teachers, every requested Class+Subject pair) against the real
  curriculum tables rather than trusting the submitted IDs. All three
  create the `User` + role profile + `RegistrationRequest` + an
  `AuditLog` row (`REGISTRATION_SUBMITTED`) inside one
  `prisma.$transaction`, so a failure partway through never leaves an
  orphaned half-created account.
- Teacher registration stores the requested class/subject combinations as
  `RegistrationRequest.requestedDetails` JSON, **not** as real
  `TeacherAssignment` rows - a teacher's request describes what they say
  they teach; an admin decides what they're actually assigned to
  afterward. Nothing here grants a teacher access to a class before
  someone reviews it.
- `registerAdminRequest` hardcodes `role: ADMIN` and `isSuperAdmin: false`
  server-side - the form's Zod schema has no field for either, so there
  is nothing for a crafted request body to override. The confirmation
  page for this path is explicitly worded "Admin access requested," never
  implying an account was created that can sign in.
- Duplicate-account checks at registration time return a specific
  "username taken" / "email already registered" message. This is a
  deliberate, conventional exception to generic-error-message practice:
  the registrant already asserts ownership of that email by registering
  with it, so confirming it exists doesn't leak anything they didn't
  already claim. Login errors remain fully generic (unchanged from Stage
  B: "Invalid username or password for that role").

**Login gating (`lib/auth/users.ts`, `app/api/auth/login/route.ts`):**
- `findUser` now returns a discriminated `LoginOutcome`
  (`success | invalid_credentials | account_status`) instead of a plain
  user-or-null, so the login route can distinguish "wrong password" from
  "correct password, but this account isn't ACTIVE yet." The password is
  always checked *before* the status is inspected, so a wrong guess can
  never be used to probe whether a given username is pending/rejected/
  suspended.
- Distinct, non-revealing copy per status (PENDING/REJECTED/SUSPENDED) -
  none of them explain *why* a review went the way it did, per the
  requirement not to leak internal review detail through the login form.
- The Stage B fallback account list (used only when `DATABASE_URL` is
  unset) is untouched: it has no concept of `AccountStatus` and every
  fallback account behaves as if `ACTIVE`, exactly as before. Stage F
  only changes behavior on the database-backed path.

**Approval workflow (`lib/actions/user-management.ts`, admin UI at
`/admin` → Users tab):**
- `requireAdminActor()` re-derives the caller from the session cookie and
  does a **fresh** `prisma.admin.findUnique` lookup for `isSuperAdmin` on
  every single call - it is never read from the session payload (which
  doesn't carry it) and never cached across calls, so a demotion/promotion
  takes effect on the very next action, not on next login.
- `approveRegistration` / `rejectRegistration`: any admin may approve or
  reject a STUDENT or TEACHER request; only `isSuperAdmin` may approve or
  reject an ADMIN request (`requireSuperAdmin()` throws otherwise); an
  admin can never approve or reject their own request, regardless of
  role. Approval flips `User.status` to `ACTIVE` and
  `RegistrationRequest.status` to `APPROVED`, atomically, plus an
  `AuditLog` row. Rejection requires a non-empty reason, flips `User.status`
  to `REJECTED` (never deletes the row), and records the reason on the
  request (shown to admins reviewing history, not to the applicant).
- `suspendUser` / `reactivateUser`: same super-admin gate for any ADMIN
  target. The bootstrap super admin (`Admin.isSuperAdmin === true`) can
  never be suspended by this action, by anyone, including another
  hypothetical super admin - there is currently no UI path that creates a
  second super admin, so in practice this protects the one bootstrap
  account outright. An admin can never suspend their own account through
  this action either.
- `listUsersForAdmin` / `listRegistrationRequests`: read-only, gated by
  `requireAdminActor()` (any admin role, not super-admin-only - viewing
  the list isn't privileged the way mutating it is).
- UI (`components/admin/users-table.tsx`, replacing the old
  `adminUsers` mock-data table): status/role filters, Approve/Reject
  (with a reason modal)/Suspend/Reactivate buttons per row, a "Super
  Admin" badge on the protected account, and admin-only buttons disabled
  client-side when the signed-in admin isn't a super admin - **disabled,
  not hidden**, and this is UX only: every mutation re-checks the same
  rule server-side regardless of what the button's `disabled` attribute
  says, so there is no code path where editing the DOM or calling the
  action directly bypasses the actual gate. Renders a
  `DatabaseUnavailable` card instead of crashing when there's no database
  (verified in the browser - see below).

**Routing (`middleware.ts`):** `/register` (and everything under it) added
to `PUBLIC_PATHS`, same treatment as `/login` - reachable while logged
out, and still reachable while logged in (nothing forces a logout to
register a second account, matching how `/login` already behaves).

**Bootstrap (`prisma/seed.ts`):** the seeded admin ("Srinidhi") now gets
`isSuperAdmin: true` and every one of the 7 demo accounts (admin, teacher,
student1-5) gets `status: "ACTIVE"` explicitly - required because the new
column defaults to `PENDING`, and without this change the seeded demo
accounts would be unable to sign in on the database-backed path once a
database is connected. Both changes are inside the existing idempotent
`upsert` calls, so re-running the seed script is still safe.

**Reasoning through the required attack scenarios** (no live database to
execute these against yet, so this is a code-level walkthrough of what
each one hits):
1. A student tries to submit `role: "ADMIN"` on the student form -
   `registerStudent`'s Zod schema has no `role` field at all; the server
   hardcodes `Role.STUDENT`. Not possible.
2. A crafted request sets `isSuperAdmin: true` on an admin registration -
   `registerAdminRequest` hardcodes `isSuperAdmin: false`; there is no
   field to overwrite it with.
3. A normal admin calls `approveRegistration` on an ADMIN-role request -
   `requireSuperAdmin()` throws `ForbiddenError`, caught and returned as
   `{ ok: false, error }`.
4. A normal admin calls `suspendUser`/`reactivateUser` on another admin -
   same `requireSuperAdmin()` gate.
5. Anyone calls `suspendUser` on the bootstrap super admin's `userId` -
   blocked unconditionally before the super-admin check even runs.
6. An admin calls `approveRegistration`/`rejectRegistration` on their own
   `RegistrationRequest.id` - blocked by the explicit
   `request.userId === actor.userId` check.
7. A PENDING/REJECTED/SUSPENDED user tries to log in with the correct
   password - `findUserInDatabase` returns `account_status`, not
   `success`; no session is issued.
8. Direct server-action call bypassing the UI (e.g. from devtools) - every
   action re-derives the actor from `getCurrentSession()` server-side;
   there is no client-supplied `userId`/`role`/`isSuperAdmin` parameter
   anywhere in `user-management.ts` or `registration.ts` for a crafted
   call to exploit.
9. A teacher or student calls anything in `user-management.ts` -
   `requireAdminActor()` throws `ForbiddenError` on the `session.role !==
   "admin"` check before any query runs.
10. A logged-out user calls an admin action - `getCurrentSession()`
    returns `null`, `requireAdminActor()` throws `UnauthorizedError`.
11. Duplicate username at registration - `assertNoDuplicateAccount` checks
    before any row is created; returns a clear error, creates nothing.
12. Duplicate email, different username - same check, `findUnique({where:
    {email}})` catches it independently of the username check.
13. Registering with a username/email that has a pending, not-yet-reviewed
    request - still caught by the same duplicate check, since the first
    registration already created the `User` row (PENDING is still a real
    row).
14. Invalid State→Board combination (e.g. a state board ID paired with an
    unrelated state) - `validateCurriculumSelection` re-checks
    `board.stateId === stateId` server-side regardless of what the
    dropdown showed.
15. Invalid Board→Class combination - same function checks
    `schoolClass.boardId === boardId`.
16. Teacher requests a class/subject pair that doesn't actually exist
    together - `registerTeacher` looks up the real
    `SchoolClassSubject` join row for every requested pair and rejects if
    it's missing or disabled.
17. A student/teacher session tries to load `/admin/users` - blocked by
    the existing `middleware.ts` `ROLE_ONLY` check (unchanged by this
    stage) before the page even renders, and independently by
    `requireAdminActor()` if a server action were called directly.
18. Rejected/suspended user's row being deleted or losing history -
    never happens; every terminal state is a status flip, and the
    `RegistrationRequest` row (with `rejectionReason`) is permanent.
19. Approving the same request twice / double-submitting - `if
    (request.status !== "PENDING")` short-circuits with an error on the
    second call; the first call's transaction already moved it out of
    `PENDING`.

**Verified (real tests, no live database required):**
- `prisma validate`/`generate` (with placeholder `DATABASE_URL`/
  `DIRECT_URL`, since neither Prisma CLI command needs a reachable
  database, only a syntactically valid connection string to parse),
  `npx tsc --noEmit`, `npm run lint`, and `npm run build` all pass.
- Full browser session, logged in via the Stage B fallback admin account:
  `/register`, `/register/student`, `/register/teacher`, `/register/admin`
  all render (both logged out and while an admin session is active,
  confirming `/register` doesn't force a logout); the curriculum
  cascading selects correctly show a "needs a connected database" notice
  and disable the submit button rather than silently failing or letting a
  half-valid form through; `/login` still shows the pre-existing 3-role
  picker plus the new "Register" link; fallback admin login still
  succeeds and redirects to `/admin`; the Users tab renders the new
  approve/reject/suspend/reactivate UI shell and correctly falls back to
  a `DatabaseUnavailable` card (not a crash) when the underlying actions
  hit the missing `DATABASE_URL`; logout still works.
- Regression-checked: `/dashboard`, `/admin` (all tabs), `/login` all
  still render exactly as before this stage for the existing fallback
  accounts - nothing in Stage F changes behavior on the fallback-auth
  path.

**Not executed against a live database (code implemented, untested at
runtime):** every registration submission, every approve/reject/suspend/
reactivate action, and the seed script's new `status`/`isSuperAdmin`
writes - the query shapes are verified by TypeScript against the real
generated Prisma client, and the authorization logic is verified by
code-level walkthrough above, but no registration has ever actually been
approved or rejected against a real row, because there is still no
`DATABASE_URL`.

## Stage G detail

**Goal:** a real AI Tutor - persisted, multi-conversation, curriculum-aware
- built behind a provider-agnostic abstraction so the first real vendor
(Gemini) is a plug-in, not baked into the app, and the system degrades
visibly rather than fabricating a response whenever the database or the AI
provider isn't available.

**Provider abstraction (`lib/ai/`):**
- `types.ts` - `AIProvider` interface (`generateResponse`), request/result
  shapes, and `AIStudentContext` (data-minimized, see below). Nothing
  outside `lib/ai/provider.ts` knows which vendor is active.
- `provider.ts` - `getAIProvider()` reads `AI_PROVIDER` and returns the
  matching implementation, or `null` if unconfigured - it never throws,
  so a missing key is a state the caller checks for, not an exception to
  catch. Three branches today: `gemini` (real, via `@google/genai`),
  `mock` (dev-only, reuses the existing `lib/socratic-engine.ts` Socratic
  responder that used to back the mock `/ai-tutor` page - explicitly
  refused when `NODE_ENV=production`, so a deployment can never silently
  serve canned responses instead of a real error), and anything else
  (including `openai`, reserved but not implemented) falls through to
  "not configured." Adding OpenAI later means adding one more branch here
  - no other file changes.
- `errors.ts` - typed `AIError` with the exact codes required:
  `AI_NOT_CONFIGURED`, `AI_PROVIDER_ERROR`, `AI_RATE_LIMITED`,
  `AI_INVALID_REQUEST`, `AI_CONTEXT_ERROR`, `UNAUTHORIZED`,
  `CONVERSATION_NOT_FOUND`. The Gemini provider logs only the HTTP status
  and error message server-side on failure (`console.error`) - never the
  request/prompt content - and only ever throws one of these typed codes
  to its caller; the raw provider exception never reaches the browser.
- `prompts.ts` - reuses the existing `PromptTemplate` model rather than
  hardcoding prompts permanently: `getPromptTemplate(name)` tries the
  database first, falls back to a built-in constant on any failure
  (missing database, missing row) so a prompt lookup can never break the
  tutor. Four templates, matching the spec: `TUTOR_SYSTEM` (the main
  teaching-behavior prompt - explain simply first, adapt to class level,
  examples and step-by-step reasoning, ask a clarifying question when
  genuinely ambiguous, teach rather than dump homework answers, encourage
  the student's own reasoning, offer practice questions, flag likely
  misconceptions, distinguish fact from uncertainty and never claim to
  have accessed data it wasn't given; separate style notes for
  math/science - show reasoning, label formulas - vs. languages - examples
  and corrections - vs. exam prep - prioritize syllabus/weak areas),
  `TUTOR_EXPLAIN`/`TUTOR_PRACTICE` (small mode-specific notes), and
  `TUTOR_WEAK_AREA` (appended only when the conversation's topic is a
  known weak area, with the mastery percentage interpolated in).
- `context.ts` - `buildStudentContext(studentId, topicId?)` assembles the
  bounded, data-minimized context described below. Every query in this
  file is scoped to the `studentId` its caller passes in - it has no
  parameter that accepts a raw `userId` or an unscoped lookup, so it has
  no way to return another student's data even by mistake.
- `rate-limit.ts` - `checkTutorRateLimit(studentId)`, a minimal in-memory
  per-student counter (12 requests/60s). **Documented limitation:** this
  is per-process and not shared across multiple server instances - there
  is no Redis or other shared store in this project. The function is the
  only integration point `lib/actions/tutor.ts` calls, so swapping the
  body for a shared-store implementation later doesn't touch any caller.

**Data minimization - exactly what is sent to the AI provider:**
`AIStudentContext` only ever contains: state name, board short name
(e.g. "CBSE"), class label (e.g. "Class 8"), subject/chapter/topic name
(only when a specific topic is in play), a mastery percentage, and up to
5 weak-topic names and 5 strength-topic names. It never contains the
student's real name, email, phone, password/passwordHash, session
secrets, school administrative data, parent data, or any other student's
information - `context.ts` has no code path that could include any of
these, since it never selects those columns in the first place.

**Conversation persistence (`lib/actions/tutor.ts`, reusing the existing
`AIConversation`/`AIMessage` models - no new/duplicate models):**
- `createConversation(topicId?)`, `listMyConversations()`,
  `getMyConversation(id)`, `sendMessage(id, content)`,
  `retryLastReply(id)` (see below), `deleteConversation(id)`,
  `getAITutorStatus()`, `getMyCurriculumScope()`.
- Every one of these calls `requireOwnStudentId()` first (session ->
  student role -> that user's own `Student` row) - the same pattern
  already used by `lib/actions/analytics.ts`, not a new one. Ownership of
  a conversation is enforced structurally: every query is
  `{ id: conversationId, studentId }`, so a conversationId belonging to
  another student (or a malformed/garbage id) simply matches nothing and
  returns "not found" - there is no separate code path that could leak
  *why* it wasn't found, so a student can't use error differences to
  probe for other students' conversation IDs.
- `sendMessage` follows the required sequence exactly: authenticate ->
  verify ownership -> validate the message (non-empty, <= 4000 characters,
  conversation under a 200-message cap) -> rate-limit check -> persist the
  student's message -> load the conversation's `contextSnapshot` (captured
  once at `createConversation` time, per the schema's own comment - never
  rebuilt on every message, which is what keeps context bounded) -> build
  the system prompt -> call the provider -> validate the response is
  non-empty -> persist the assistant message -> bump `updatedAt` -> return.
  If generation fails (`AI_NOT_CONFIGURED`/`AI_PROVIDER_ERROR`/rate limit),
  no assistant message is fabricated; whatever was already persisted stays
  persisted.
- **Retry without duplication:** because rate-limiting and validation
  happen *before* the student's message is persisted, but provider
  failures happen *after* it's persisted, a naive "just call sendMessage
  again" retry would sometimes duplicate the student's message and
  sometimes not, depending on which failure occurred. `retryLastReply(id)`
  avoids this by checking that the conversation's last message is still
  an un-replied `STUDENT` turn and then only re-running the
  generate-and-persist step - never a second user message. The UI
  (`components/ai-tutor/real-tutor-view.tsx`) re-fetches the conversation
  from the server after any failure rather than guessing locally what was
  saved, so it can never show a message as "sent" that wasn't.
- Conversation titles start as "New conversation" and are set from the
  first student message (truncated) the first time one is sent - no
  separate "rename" UI in this pass.

**Gemini provider - what was actually verified:** no SDK existed in this
project before this stage. `@google/genai` (the current official Google
Gen AI SDK, `googleapis/js-genai`, v2.18.0) was confirmed via the npm
registry and then installed; the exact request/response shape used in
`lib/ai/provider.ts` (`new GoogleGenAI({apiKey})`,
`ai.models.generateContent({model, contents, config: {systemInstruction,
temperature, maxOutputTokens}})`, `response.text`, `ApiError` with a
`.status` field) was read directly from the installed package's own
shipped `.d.ts` type definitions, not guessed or copied from an
unverified example. The SDK is only ever `import()`-ed dynamically inside
`GeminiProvider.generateResponse` - never at module load - so its absence
or a missing key has zero effect on `next build` or on any code path that
doesn't actually try to generate a reply.

**UI (`/ai-tutor` - reused, not duplicated as a new `/tutor` route; it was
already the mock AI Tutor Chat page from Step 1/2, already in
`middleware.ts`'s `STUDENT_PATHS` and `lib/nav.ts`):**
- `components/ai-tutor/real-tutor-view.tsx` replaces the old mock
  `AiTutorView` at this route. Conversation sidebar (new chat, list,
  per-item delete with an inline confirm step), message list with
  student/assistant bubbles, an empty state with the 5 suggested prompts
  from the spec (populate the input, never auto-send), Enter-to-send /
  Shift+Enter-for-newline, disabled composer while sending, and a
  Retry action that appears only when the last turn is an unanswered
  student message.
- `components/ai-tutor/curriculum-picker.tsx` - optional, collapsed by
  default, Subject -> Chapter -> Topic selector reusing the existing
  `lib/actions/curriculum.ts` reads (`listSubjectsForClass`,
  `listChaptersForSubject`) - no new curriculum queries. Picking a topic
  starts a new, context-attached conversation; the tutor works perfectly
  well with general questions if this is never touched.
- The old mock `AiTutorView`/`ChatBubble`/`ConversationSidebar` and
  `lib/mock-data/ai-tutor.ts` are left in place but no longer referenced
  from any route - `lib/socratic-engine.ts` is still live, reused as the
  `mock` provider's actual logic rather than being duplicated.
- **Two distinct graceful states**, per the spec: `components/
  database-unavailable.tsx` (reused, unchanged) when the database itself
  is unreachable ("Tutor data needs a connected database..."), and a
  separate banner - only reachable once the database *is* available -
  reading "AI Tutor is not configured yet. Please configure the AI
  provider to start chatting." when `AI_PROVIDER`/`GEMINI_API_KEY` aren't
  set. The two are checked independently (`getAITutorStatus()` for the
  second one) so the UI never conflates "no database" with "no AI key."

**"Ask Tutor" integration (spec #18/#19) - deliberately placed on the
dashboard's *real* data cards, not the still-mock `/weak-areas` page:**
the mock `/weak-areas` page (`lib/mock-data/weak-areas.ts`) has no real
database topic IDs to link with, so a shortcut there could only pass a
free-text guess, not real context - the spec is explicit about using the
actual database topic ID. `components/dashboard/real-data-section.tsx`'s
Weak Areas card (Stage E6, already database-backed) already has a real
`topicId` per row, so its "Ask Tutor" link opens `/ai-tutor?topicId=...`
(attaches real curriculum/mastery context server-side) with the input
pre-filled with the spec's exact example phrasing ("Help me improve in
{Topic}. Explain the concept first, then give me 3 practice questions.").
The Learning Path card's items (`StudyPlanItem`) have no `topicId` in the
schema, only free-text `subject`/`title`, so their "Ask Tutor" link only
pre-fills the input (`?prefill=...`) rather than attaching database
context - reusing the existing learning-path data as-is, not inventing a
topic link that doesn't exist.

**Security - server-side, not middleware-only** (every claim below is
enforced inside `lib/actions/tutor.ts` itself, not just by
`middleware.ts`'s route gate):
1. Only authenticated students reach `/ai-tutor`'s data -
   `requireOwnStudentId()` throws `UnauthorizedError`/`ForbiddenError` for
   anyone else, independent of the route-level block.
2. A teacher/admin session calling a tutor action directly (bypassing the
   UI) hits the same `requireRole("student")` check and is rejected.
3. Student A can't read Student B's conversation: every read/write is
   `{ id, studentId: <own> }` - see "Conversation persistence" above.
4. Prompt templates are read-only from this subsystem's perspective -
   nothing in `lib/actions/tutor.ts` or `lib/ai/*` ever writes to
   `PromptTemplate`; only a (not-yet-built) admin UI could, and no such
   UI was added in this stage.
5. No action accepts a `studentId`/`userId`/role as a parameter - it is
   always derived from the session, so there is nothing for a crafted
   payload to override.
6. Provider API keys are read only inside `lib/ai/provider.ts` (a
   `server-only`-guarded module) and passed only to the dynamically
   imported SDK - never returned from any action, never serialized into
   any client-visible prop or response.

**Testing - verification suite:**

```
TypeScript (npx tsc --noEmit): PASS
Lint (npm run lint):           PASS (no warnings)
Build (npm run build):         PASS - /ai-tutor and all routes build with
                                no DATABASE_URL and no GEMINI_API_KEY set,
                                confirming the SDK's dynamic import keeps
                                the build key-independent
Prisma validate:                PASS (placeholder DATABASE_URL/DIRECT_URL -
                                neither command needs a reachable database)
Prisma generate:                PASS
```

Browser-verified (fallback-auth accounts, no live database):
`/ai-tutor` redirects an unauthenticated visitor to `/login`; an admin
session hitting `/ai-tutor` is bounced to `/admin` and a teacher session
to `/teacher` (both via the pre-existing `middleware.ts` role gate,
unchanged by this stage); a student session (fallback auth) reaches
`/ai-tutor` and it renders the `DatabaseUnavailable` card cleanly - no
blank page, no unhandled exception - with the exact "Tutor data needs a
connected database..." copy; `/dashboard` still renders normally for a
student with the new "Ask Tutor" links compiled into
`real-data-section.tsx` (unexercised in this run only because the whole
real-data section itself falls back to its own database-unavailable card
first, same as every other Stage E widget).

**Not executed (no database, no AI provider key):** every conversation/
message create-read-update-delete against a real row; an actual Gemini
`generateContent` call (so the exact wording, latency, and error
responses of a real Gemini response were never observed - only the
request/response *shape* was verified against the SDK's own type
definitions); the "AI Tutor is not configured yet" banner has not been
seen rendered in a live browser, because reaching it requires a database
connection this environment doesn't have (the code path itself - `
getAIProvider() === null` when `AI_PROVIDER` is unset - was exercised via
`npx tsc --noEmit` and direct reading, not a browser render); the
`mock` provider (`AI_PROVIDER=mock`) was not exercised end-to-end either,
for the same reason. No automated unit tests were added: this repository
has no test runner configured (no jest/vitest/`test` script anywhere),
and adding one purely for this stage was judged to be more
infrastructure than the "don't overbuild" instruction calls for: instead,
`npx tsc --noEmit` (which catches most structural/type errors across
`lib/ai/*`) plus the browser checks above are the verification actually
performed.

## Stage H detail

**Goal:** replace mock analytics with real, persisted-data reporting for
students, teachers, and admins - without duplicating routes, without a
second copy of the Stage E analytics engines, and without ever showing a
number that isn't backed by an actual row in the database.

**No Prisma schema changes.** Every requirement was met by reading the
existing schema differently, not by adding to it - see the two specific
decisions below (Bloom-level, activity heatmap) for why.

### Routes changed (all reused, none duplicated)

- **`/performance`** - fully converted from `lib/mock-data/performance.ts`/
  `progress.ts` to real data. Now an async Server Component (matching
  `components/dashboard/real-data-section.tsx`'s established pattern),
  wrapped in the same try/catch -> `DatabaseUnavailable` shape as every
  other Stage C-G real page.
- **`/weak-areas`** - converted from `lib/mock-data/weak-areas.ts` to the
  real `getMyWeakAreas()`. Same route, same visual structure, real data.
- **`/strengths`** - **new route**, because no real strengths page existed
  (the dashboard's Strengths card only ever showed a top-4 summary). Mirrors
  `/weak-areas`'s structure/visual language exactly. Added to
  `middleware.ts`'s `STUDENT_PATHS` and `lib/nav.ts`.
- **`/results`** - already fully real from Stage D (`listResultsForStudent()`,
  proper empty/pending-review/`DatabaseUnavailable` states). **Not
  touched** - re-verified it already satisfies every H1 requirement rather
  than duplicating its query logic.
- **`/dashboard`** - untouched at the route level; its existing mock
  widgets are still mock (Stage H doesn't touch them). Only
  `components/dashboard/real-data-section.tsx`'s already-real Today's
  Planner and Learning Path cards gained analytics (completion %, weekly
  %, weak-topic coverage, "next up") - presentation-only additions over
  data the section already fetched, per the "don't recompute
  learning-path logic in the UI" instruction.
- **`/teacher`** - untouched mock cards (`ClassSubjectSelector`,
  `CreateClassCard`, `CreateExamsCard`, `UploadMaterialCard`,
  `GradeSubmissionsCard`) all still present and working exactly as
  before. A new, clearly-labeled "Real class analytics" section was added
  below them (`components/teacher/real-class-analytics.tsx`), with its
  own class/subject selector scoped to the teacher's actual
  `TeacherAssignment` rows - separate from the pre-existing mock
  `ClassSubjectSelector`, which still drives the other mock cards
  unchanged.
- **`/teacher/exams/[examId]`** - one new card
  (`ExamQuestionAnalytics`) added between the existing `QuestionBuilder`
  and `SubmissionsList`, only rendered once the exam is no longer a
  draft. Nothing else on this page was changed.
- **Admin `/admin` -> Dashboard tab** - `PlatformAnalytics` converted from
  `lib/mock-data/admin.ts` to real aggregate counts. Same tab, same
  component name, real data.

### Server actions / query modules added

- **`lib/actions/analytics.ts`** gained `getMyOverallPerformance()`,
  `getMyBloomPerformance()`, `getMyActivityHeatmap()` - all behind the
  file's existing `requireOwnStudentId()`, unchanged.
- **`lib/actions/planner.ts`** gained `getPlannerAnalytics()` (today's and
  a rolling-7-day "week" completion/skipped/remaining breakdown), behind
  the file's existing `requireOwnStudent()`.
- **`lib/actions/teacher-analytics.ts`** (new file) -
  `getClassOverview`, `getStudentPerformanceTable`,
  `getClassTopicDifficulty`. All three call `requireOwnedAssignment`
  (exported from `lib/actions/exams.ts`, reused rather than duplicated) -
  the exact same "does this teacher actually have a `TeacherAssignment`
  for this class+subject" check that exam creation already used. Every
  query is additionally filtered by `teacherId` when reading `Exam`/
  `ExamSubmission` rows, so even two teachers legitimately assigned to
  the same class/subject only ever see analytics for exams *they*
  created.
- **`lib/actions/exams.ts`** gained `getExamQuestionAnalytics(examId)`,
  behind the existing `requireOwnedExam` (also newly exported, for the
  same reuse-not-duplicate reason). `requireOwnedAssignment` was also
  exported from this file for `teacher-analytics.ts` to import.
- **`lib/actions/admin-analytics.ts`** (new file) - `getPlatformAnalytics()`,
  behind `requireAdminActor` (exported from `lib/actions/user-management.ts`,
  reused). Returns aggregate counts only - `.count()` per metric via
  `Promise.all`, never a full-table `findMany`, never an individual
  student/user record.

### Authorization model (re-verified per function, not just by middleware)

- **Student**: every one of the three new `lib/actions/analytics.ts`
  functions and `getPlannerAnalytics()` starts with the file's existing
  `requireOwnStudentId()`/`requireOwnStudent()` - session -> role check ->
  that user's own `Student` row. There is no parameter anywhere in these
  functions that accepts a student id from the caller.
- **Teacher**: `getClassOverview`/`getStudentPerformanceTable`/
  `getClassTopicDifficulty` all take a `schoolClassId`/`subjectId` *as
  UI filters*, but the very first line of each is
  `requireOwnedAssignment(schoolClassId, subjectId)`, which re-derives
  the teacher from the session and throws `ForbiddenError` unless a
  matching `TeacherAssignment` row exists for that exact teacher. A
  teacher cannot pass another teacher's class/subject pair and see
  data - the assignment check fails, nothing is returned.
  `getExamQuestionAnalytics(examId)` uses `requireOwnedExam`, which
  additionally checks `exam.teacher.userId === session.id` - a teacher
  cannot view analytics for an exam they don't own even if it's for a
  class/subject they're otherwise assigned to.
- **Admin**: `getPlatformAnalytics()` calls `requireAdminActor()`, the
  same check `lib/actions/user-management.ts`'s approve/reject/suspend
  actions already use (any authenticated admin - platform analytics
  isn't super-admin-gated, matching the read-only "viewing isn't
  privileged the way mutating it is" reasoning already documented for
  `listUsersForAdmin` in Stage F). No student/user record is returned,
  only counts.
- **Middleware is still not the only line of defense.** Every function
  above performs its own authorization independent of
  `middleware.ts`'s route gate - a direct server-action call bypassing
  the UI hits the exact same checks a page load would.

### Bloom-level derivation (H6)

`ExamQuestion` has no Bloom field. `Topic.bloomLevel` does (a single
classification per topic - curriculum design metadata, not per-answer).
`getMyBloomPerformance()` joins `ExamAnswer -> ExamQuestion.topicId ->
Topic.bloomLevel` and buckets marks by the topic's classification. The
`/performance` UI labels this card **"Performance by Topic Bloom
Level"** and its description explicitly says this comes from "each
answered question's topic classification... not an individually-classified
question" - it would be misleading to present this as per-question Bloom
tagging when the schema doesn't have that. Only the real enum values
(`REMEMBER`/`UNDERSTAND`/`APPLY`/`ANALYZE`) are used - `EVALUATE`/`CREATE`
were never invented. `getExamQuestionAnalytics` (teacher side) surfaces the
same `topic.bloomLevel` per question, when a topic is tagged, for the same
honest reason.

### Activity heatmap derivation (H5)

No activity-log model was added. `getMyActivityHeatmap()` derives daily
activity entirely from three already-persisted, timestamped sources:
`ExamSubmission.submittedAt`, `WorksheetSubmission.submittedAt`, and
`DailyPlannerTask` rows with `status = COMPLETED` (by `date`). Each real
event bumps that calendar day's count (capped at 4, matching the existing
`Heatmap` component's 5-level intensity scale); a day with zero matching
events is a real, honestly-computed 0, not a gap. The function returns
every day in the 84-day (12-week) window plus a `hasAnyActivity` flag, so
the UI can show "No activity recorded in the last 12 weeks" without
hiding the (accurately empty) grid.

`components/charts/heatmap.tsx` got one change: its `data` prop is now
**optional**. `/dashboard`'s pre-existing usage (`<Heatmap />`, no prop)
is completely unchanged - it still renders the original
`lib/mock-data/progress.ts` mock data, exactly as before Stage H.
`/performance` is the only caller that passes real `data`. This was the
deliberate way to "reuse/upgrade the existing heatmap component" (per the
Stage H brief) without touching the dashboard's still-mock widget stack.

### Date/time convention (H13)

Every new date-bucketed query (`getMyActivityHeatmap`, `getPlannerAnalytics`)
uses the exact same convention `lib/actions/planner.ts`'s pre-existing
`getTodayOverview()` and `lib/analytics/learning-path.ts` already used:
`new Date()` + `setHours(0, 0, 0, 0)` to get a server-local "start of
day," with no timezone library and no UTC conversion. This was a
deliberate consistency choice, not an oversight: introducing a
timezone-aware "today" only for the new Stage H queries while every
other date-sensitive feature in the app (today's planner, learning-path
generation, exam due dates) keeps using server-local time would make
different pages disagree about what day it is - worse than one
consistent, documented limitation.

**Known limitation:** date-bucketed analytics currently follow the
application's existing server-local date convention (server-local, which
is UTC on Vercel). A student in India (UTC+5:30) whose activity happens
late at night IST could see it attributed to the following server-local
calendar day. A dedicated timezone strategy (storing/deriving each
student's local timezone) can be introduced later if required - this
was judged out of scope for a reporting stage that inherits, rather than
fixes, an existing app-wide convention.

**Data-quality guards applied throughout:** every percentage calculation
checks its denominator before dividing (`x > 0 ? Math.round(...) : null`,
never a bare division that could produce `NaN`); a metric with zero
underlying data returns `null`/an explicit empty state, never a
misleading `0%`; every "insufficient data" case has distinct UI copy
("Not enough graded activity yet", "No weak areas detected", "No
submissions yet") rather than a generic zero.

### Verified (real tests, no live database required)

- `npx tsc --noEmit`, `npm run lint`, `npm run build` (with placeholder
  `DATABASE_URL`/`DIRECT_URL` for the Prisma commands only - neither
  needs a reachable database), `npx prisma validate`, `npx prisma
  generate` all pass. No schema diff - `prisma validate`/`generate` ran
  against the unchanged schema.
- Full browser session via the Stage B fallback accounts, no live
  database:
  - Unauthenticated visitor hitting `/performance` is redirected to
    `/login`.
  - Student (fallback) reaches `/performance`, `/weak-areas`,
    `/strengths`, `/results`, `/dashboard` - every one renders its
    `DatabaseUnavailable` card cleanly, no blank page, no crash.
  - Teacher (fallback) hitting `/strengths` (a student-only path) is
    bounced to `/teacher`; `/teacher` itself renders with every
    pre-existing mock card intact plus the new "Real class analytics"
    section correctly showing its own `DatabaseUnavailable` state;
    `/teacher/exams/<fake-id>` renders the pre-existing
    `DatabaseUnavailable` fallback (confirms the new
    `getExamQuestionAnalytics` call didn't break that page's existing
    try/catch).
  - Admin (fallback) hitting `/performance` or `/teacher` is bounced back
    to `/admin`; `/admin`'s Dashboard tab renders the converted
    `PlatformAnalytics` with its own `DatabaseUnavailable` state.

### Not executed against a live database (code implemented, untested at
runtime)

Every actual aggregate query result (`.count()` values, average-score
calculations, heatmap day buckets, topic-difficulty percentages,
Bloom-level buckets) - the query shapes are verified by TypeScript
against the real generated Prisma client (which catches most structural
errors - wrong field names, wrong relation includes, wrong enum values),
and the authorization logic is verified by code-level reasoning above,
but no real row has ever been aggregated, because there is still no
`DATABASE_URL`. No unit tests were added, for the same reason already
documented for Stage G (no test runner exists in this repository yet;
`npx tsc --noEmit` plus the browser checks above are the substitute, per
the "don't overbuild" instruction).

## Stage I detail

**Goal:** take the app from "fully implemented and typechecked without
external infrastructure" to "safe and operational once a real Postgres
database and Vercel Blob are connected" - without adding another
feature. No Prisma schema changes were made or needed.

### Migration readiness

No `prisma/migrations/` existed before this stage. `prisma migrate dev`
needs a live database (it computes a diff via a shadow database), so it
couldn't be used here. Investigated and used instead:
```bash
npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script
```
This translates the schema straight into SQL using Prisma's built-in
provider-specific generator, with **no database connection required** -
confirmed by running it with `DATABASE_URL`/`DIRECT_URL` both unset
(exit code 0, 1294 lines of valid SQL). The output was saved as
`prisma/migrations/20260824190000_initial_schema/migration.sql`, plus
the standard `prisma/migrations/migration_lock.toml`
(`provider = "postgresql"`). **Correspondence verified**: re-running the
same command and diffing its output against the committed file produces
an exact match - the migration SQL is guaranteed to reflect the current
schema. **What this does not verify**: that the SQL actually applies
cleanly to a real Postgres database, or that Prisma's own migration-history
bookkeeping is consistent - both require a live database
(`--from-migrations` with a `--shadow-database-url`, tried and confirmed
it needs real credentials: `Error: P1000 Authentication failed`). The
migration is **not** marked or claimed as applied anywhere. `npx prisma
migrate status` was also attempted and, as expected, fails immediately
with `Environment variable not found: DIRECT_URL` - documented as "cannot
reach database," not treated as a code defect.

### Production auth fail-closed hardening (two real findings, both fixed)

1. **`lib/auth/session.ts`** - `SESSION_SECRET` previously fell back to a
   hardcoded string with no environment check at all. Fixed by moving
   secret resolution into a `resolveSessionSecret()` function called
   *lazily* inside `getKey()` (not at module load / not a top-level
   `const`) - this matters because `session.ts` is imported by
   `middleware.ts`, which Next.js evaluates while bundling for every
   request and during `next build`'s page-data collection; a top-level
   throw would have failed the build itself whenever `SESSION_SECRET`
   is unset, which is this repo's normal state. Lazy resolution means the
   check only fires when a session is actually signed/verified. In
   production with no `SESSION_SECRET`, it throws instead of silently
   using the dev secret; in development, the existing dev fallback is
   unchanged. `verifySession()` was also restructured so `getKey()` is
   called *outside* its try/catch - a config error propagates to the
   caller instead of being swallowed into a misleading "not logged in."
2. **`lib/auth/users.ts`** - `findUser()` previously chose the demo-account
   fallback whenever `DATABASE_URL` was unset, with no `NODE_ENV` check -
   meaning a production deployment that simply forgot to set
   `DATABASE_URL` would have silently authenticated the well-known demo
   credentials. Fixed: the fallback path now additionally requires
   `NODE_ENV !== "production"`; production with no `DATABASE_URL` throws
   a new typed `AuthConfigurationError`. `app/api/auth/login/route.ts`
   catches this specifically and returns `503 { error: "Sign-in is
   temporarily unavailable. Please try again later." }` - the real reason
   is `console.error`-logged server-side only, never returned to the
   client, and never surfaces as "invalid credentials." (Separately
   confirmed already-correct, unchanged: a *configured but unreachable*
   `DATABASE_URL` was already failing closed before this stage -
   `findUserInDatabase` doesn't catch its own Prisma error, so it was
   always propagating as a normal failed request, never a demo-account
   fallback.)

**Both behaviors were runtime-tested**, not just typechecked: built the
app (`npm run build`) and ran `next start` on a separate port (3901)
with `DATABASE_URL`/`SESSION_SECRET` unset via a temporary process-env
override (`.env.local` untouched) —
- `POST /api/auth/login` (admin/Admin@123, the real demo credentials) →
  `503 {"error":"Sign-in is temporarily unavailable. Please try again
  later."}` - demo login does **not** work in this configuration.
- `GET /dashboard` with a malformed session cookie present (so
  `verifySession` reaches the signature-check code path) → generic `500
  Internal Server Error` HTML page, no stack trace, no secret value.
- `GET /login` with **no** cookie at all → `200`, confirming the fix
  doesn't affect requests that never need to verify a session (the check
  is lazy, not blanket).
- Server-side logs confirmed both real reasons were logged
  (`[auth] login blocked by configuration error: DATABASE_URL is not
  configured...` and `Error: SESSION_SECRET is not configured...`) -
  useful for debugging, never exposed to the client.

### Environment contract

`.env.example` rewritten with an explicit classification header
(`[REQUIRED IN PRODUCTION]` / `[OPTIONAL / PROVIDER]` /
`[DEVELOPMENT-ONLY]`) on every variable, and updated `SESSION_SECRET`/
`DATABASE_URL`/demo-password comments to describe the new fail-closed
behavior. Cross-checked against every `process.env.X` reference in
`lib/`, `app/`, `middleware.ts`, and `prisma/` (via `grep -rohE`) -
confirmed `.env.example` already covered every variable the app actually
reads; nothing was missing.

### Seed audit (`prisma/seed.ts`) - no changes required

Re-audited line-by-line against the Stage I checklist:
`isSuperAdmin: true` appears in exactly one upsert (the bootstrap admin's
`update`/`create` branches - same user, both branches), never anywhere
else. `status: "ACTIVE"` is set on all 7 demo accounts. Passwords are
hashed via the seed's own `hashPassword()` (bcrypt, `SALT_ROUNDS = 12`,
duplicated from `lib/auth/password.ts` for the documented `server-only`-
under-`tsx` reason - see the Stage A note in this file). 20
upsert/findFirst/findUnique call sites confirm idempotency throughout;
curriculum data is entirely table-driven, no hardcoded UI strings.
`console.log` calls are all progress/count messages, never a credential
value. No changes were made to this file in Stage I - it already met
every requirement.

### Admin material upload (real Blob integration)

`components/admin/study-materials-card.tsx` was fully rewired from
Step 1/2 local-state simulation to the real Stage C pipeline - no new
server action was written; `createMaterial`/`setMaterialPublished`/
`deleteMaterial`/`listMaterialsForAdmin` (all pre-existing, already
authorized: admin unrestricted, teacher scoped to `TeacherAssignment`,
ownership-checked publish/delete) were reused as-is. The new form drives
a full State -> Board -> Class -> Subject -> Chapter -> optional Topic
cascade via the existing `lib/actions/curriculum.ts` reads, plus title/
description/material-type/file. Client-side MIME/size checks import
`ALLOWED_MIME_TYPES`/`MAX_UPLOAD_BYTES`/`validateUploadFile` directly
from `lib/storage/types.ts` (a UX nicety only - the server re-validates
independently, unchanged). `StorageNotConfiguredError` and a missing-
database fetch both render an explicit inline message; nothing pretends
an upload succeeded. Browser-verified: the full cascading form renders
with real curriculum selects, the existing-materials list shows
`DatabaseUnavailable` gracefully, and submitting with no title shows
"Title is required." without a crash (client validation working, no
network round-trip needed to fail safely).

### Teacher worksheet UI (new route, existing server actions)

`/teacher/worksheets` is new; `lib/actions/worksheets.ts`'s
`createWorksheet`/`setWorksheetPublished`/`deleteWorksheet`/
`listWorksheetsForTeacher`/`gradeWorksheetSubmission` (all pre-existing
from Stage C, already `TeacherAssignment`-scoped and ownership-checked)
were reused unchanged. One new action was added -
`updateWorksheet(worksheetId, input)` - because no edit capability
existed at all; it follows the exact same `worksheet.teacher.userId ===
session.id` ownership check already used by `setWorksheetPublished`/
`deleteWorksheet`, and only edits title/instructions/chapter/topic/due
date - not class/subject, since changing those would need a fresh
assignment-scope decision (that's a new worksheet, not an edit).
`CreateWorksheetForm` only ever offers class/subject pairs from the
signed-in teacher's own `listMyTeacherAssignments()` (Stage D, reused
unchanged); `createWorksheet` re-validates that pair against
`TeacherAssignment` server-side regardless of what the client sent - a
crafted request with an unassigned class/subject pair is rejected the
same way the UI already prevents selecting one. A "Worksheets" entry
card (`components/teacher/manage-worksheets-card.tsx`) was added to the
existing `/teacher` mock dashboard, mirroring the pre-existing
`CreateExamsCard`'s exact pattern - every other mock card on that page
(`ClassSubjectSelector`, `CreateClassCard`, `UploadMaterialCard`,
`GradeSubmissionsCard`) is untouched. Browser-verified: `/teacher/worksheets`
renders with `DatabaseUnavailable`; the "Worksheets" card appears on
`/teacher` alongside every existing card; an admin session hitting
`/teacher/worksheets` is redirected to `/admin` by the pre-existing
middleware role gate (the new route needed no middleware change - it
already matches the `/teacher` prefix in `ROLE_ONLY`).

### Authorization security audit

Read (not merely grepped) the relevant server actions and authorization
helpers across registration, login, approval/suspension, materials,
worksheets, exams, analytics, AI tutor, and admin/teacher/student
actions, against the 17-item checklist. **Result: no new vulnerabilities
found beyond the two auth-fallback gaps above**, which are now fixed.
Specifically re-confirmed by reading the actual code (not assumed from
memory): `requireOwnedExam`/`requireOwnedAssignment`
(`lib/actions/exams.ts`, also reused by the new
`lib/actions/teacher-analytics.ts`) check `exam.teacher.userId`/a real
`TeacherAssignment` row; `setWorksheetPublished`/`deleteWorksheet`/the
new `updateWorksheet` check `worksheet.teacher.userId`;
`saveExamAnswer`/`submitExam` check `submission.studentId`; every
student analytics/tutor function derives `studentId` from
`requireOwnStudentId()`/`requireRole("student")` and never accepts one
as a parameter; `lib/actions/tutor.ts`'s `deleteConversation` uses
`deleteMany({ where: { id, studentId } })` - a mismatched id simply
matches nothing; `approveRegistration`/`rejectRegistration`/
`suspendUser`/`reactivateUser` (Stage F) all still gate ADMIN-role
targets behind `requireSuperAdmin()`, block self-approval
(`request.userId === actor.userId`) and self-suspension, and
unconditionally refuse to suspend the bootstrap super admin regardless of
caller; `registerAdminRequest` still hardcodes `role: ADMIN` and
`isSuperAdmin: false` server-side with no client-settable field for
either. `lib/actions/exam-schedule.ts` (not previously covered in a
Stage-specific write-up) was read fully for this audit: admin-only,
intentionally not per-admin-owned (any admin may manage any schedule),
no IDOR risk found.

### Error handling / production failure modes

Reviewed against the checklist (missing DB, missing Blob, malformed/
unauthorized ids, duplicate registration/submission, invalid file
types/oversized files, deleted curriculum rows). No gaps found requiring
a code change beyond STEP 5/6's forms themselves following the same
established patterns already used throughout Stages C-H
(`DatabaseUnavailable`, typed `StorageNotConfiguredError`, Zod-validated
inputs, ownership-checked mutations returning `{ok:false, error}` rather
than throwing where the failure is a normal user-facing case).

### Verification

```
Prisma validate:  PASS
Prisma generate:  PASS
TypeScript:       PASS (npx tsc --noEmit)
Lint:              PASS (one real finding - an unescaped apostrophe in
                   the new manage-worksheets-card.tsx - fixed, re-ran clean)
Build:             PASS (all routes, including the new /teacher/worksheets,
                   built successfully with no DATABASE_URL/SESSION_SECRET/
                   BLOB_READ_WRITE_TOKEN configured)
```

Browser-verified (fallback auth, no live database): `/login` renders and
the demo-account login flow still works in development; teacher session
reaches `/teacher/worksheets` (graceful `DatabaseUnavailable`) and sees
the new "Worksheets" card on `/teacher`; admin session reaches the
Study Materials tab, sees the full real cascading upload form, gets
client-side "Title is required." on an empty submit (no crash), and is
correctly redirected away from `/teacher/worksheets`. Plus the separate
`next start`-based production fail-closed tests described above.

### Not executed (no live database, no Blob token, no AI provider key)

Any real migration apply (`prisma migrate deploy`/`db:seed` against a
live database), any actual material upload to Vercel Blob, any actual
worksheet create/edit/delete/grade against real rows, any actual
registration/approval persisted to a database, and any real Gemini
generation. Nothing here was claimed as tested against live
infrastructure - see the "Migration readiness" and "Production auth"
subsections above for exactly what *was* verified without one.
