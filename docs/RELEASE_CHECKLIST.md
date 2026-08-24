# Release Checklist (Stage L)

This is the operational companion to `docs/STEP_3_5.md` (stage-by-stage
history) and `docs/DATABASE.md`/`docs/ARCHITECTURE.md` (architecture).
Where those documents explain *what was built and why*, this document is
the exact, ordered procedure and test matrix for *turning it on against
real infrastructure* - written because no real `DATABASE_URL`,
`BLOB_READ_WRITE_TOKEN`, or AI provider key has ever existed in any
environment this project has been developed in (Stages A-L). Nothing in
this document has been executed against live infrastructure; it is the
plan for when it can be.

---

## 1. Production setup procedure (exact order)

Distinguish three environments throughout:

- **Development** - a developer's own machine. `DATABASE_URL` unset is
  fully supported (demo-account fallback, see `docs/DEMO_CREDENTIALS.md`).
- **Staging** - a real database/Blob/AI provider, but not the one real
  users depend on. Use this to run through this entire checklist *before*
  touching production.
- **Production** - the real deployment. Every step below applies; the
  demo-account fallback is refused here regardless of `DATABASE_URL`
  (see `docs/DATABASE.md` "Production authentication policy").

Never put real secret values in source control, in this repository, in
`.env.example`, or in any file that gets committed. Set them only in
`.env.local` (untracked, see `.gitignore`) locally, or in your hosting
provider's environment-variable settings (e.g. Vercel Project Settings ->
Environment Variables) for staging/production.

1. **Provision PostgreSQL.** Any Postgres-compatible provider (Vercel
   Postgres/Neon is what this project's docs assume, but nothing here is
   provider-specific beyond the pooled/non-pooled connection-string
   split in step 2).
2. **Configure database env vars:**
   - `DATABASE_URL` - the **pooled** connection string (runtime queries).
   - `DIRECT_URL` - the **non-pooled** connection string (`prisma
     migrate`/`prisma db seed` only - schema changes can't run through a
     pgbouncer pool). If your provider gives you only one string, set
     both to the same value.
   - `SESSION_SECRET` - a long random value (e.g. `openssl rand -base64
     32`). **Required** in production - see `docs/DATABASE.md`
     "Production authentication policy." Never reuse the value checked
     into `lib/auth/session.ts` as the development fallback.
3. **Apply the existing migration** (do **not** use `prisma db push` or
   `prisma migrate dev` against a shared/production database):
   ```bash
   npx prisma migrate deploy
   ```
   This applies `prisma/migrations/20260824190000_initial_schema/`
   non-interactively and records it in `_prisma_migrations`. See
   "Migration release safety" below for what was verified about this
   migration offline.
4. **Seed - only when appropriate, and only with overrides set.** See
   "Seed safety" below before running this in anything but a fresh
   development database. In short: set every `*_PASSWORD` override env
   var first, then:
   ```bash
   npm run db:seed
   ```
5. **Verify the seed** (read-only, safe to run anywhere):
   ```bash
   npm run db:verify
   ```
   See "Smoke-test harness" below for exactly what this checks.
6. **Configure Vercel Blob** (optional - only needed for file uploads):
   - `BLOB_READ_WRITE_TOKEN` from your Vercel project's Storage tab.
   - Without it, uploads fail with a clear "storage is not configured"
     error; nothing else in the app is affected.
7. **Configure AI** (optional - only needed for the AI Tutor):
   - `AI_PROVIDER=gemini` and `GEMINI_API_KEY` (the only implemented
     provider as of this stage - see `docs/STEP_3_5.md` Stage G).
   - Never set `AI_PROVIDER=mock` outside development - it's refused at
     runtime when `NODE_ENV=production` (see `lib/ai/provider.ts`).
8. **Build:**
   ```bash
   npm run build
   ```
9. **Start/deploy:** `npm start` (self-hosted) or your platform's normal
   deploy flow (e.g. `vercel deploy` - **not run by this project's
   tooling automatically**; a human decides when to actually deploy).
10. **Create/approve the initial super admin safely.** The bootstrap
    super admin is created by the seed step (step 4), not by the
    registration flow - `lib/actions/registration.ts` can never create
    or self-elevate a super admin (see "Security" test matrix below).
    Change that account's password immediately after first login if the
    seeded `ADMIN_PASSWORD` was only a placeholder.
11. **Run the live smoke-test matrix** - section 8 below.

---

## 2. Migration release safety

Re-verified as part of Stage L (see `docs/STEP_3_5.md` "Stage L detail"
for the exact commands run):

- `prisma/migrations/migration_lock.toml` and
  `prisma/migrations/20260824190000_initial_schema/migration.sql` are
  both tracked in git (`git ls-files prisma/migrations/` confirms both).
- Re-generating the migration offline
  (`npx prisma migrate diff --from-empty --to-schema-datamodel
  prisma/schema.prisma --script`) and diffing against the committed file
  produces an **exact match** - the migration corresponds to the current
  schema with no drift.
- No destructive statements exist in the migration (checked for
  `DROP`/`TRUNCATE`/`DELETE FROM` - none found, expected for an initial
  migration with nothing to drop).
- Structural correspondence: 53 Prisma models -> 54 SQL tables (the
  extra one is `_SubjectPrompts`, Prisma's implicit many-to-many join
  table - expected), 24 enums -> 24 SQL types (exact), 90 foreign keys,
  29 unique + 38 regular indexes.
- The schema has no `prisma db push` dependency anywhere - `package.json`
  has no `db:push` script, only `db:migrate` (`prisma migrate dev`,
  local/dev-only) and `db:deploy` (`prisma migrate deploy`, the correct
  production command).

**This confirms the migration is internally consistent and ready to
apply** - it does not confirm it applies cleanly to a real Postgres
instance, which requires an actual `prisma migrate deploy` run against
one. That step remains pending real credentials.

---

## 3. Seed safety

`prisma/seed.ts` creates two categories of data:

1. **Curriculum reference data** (States/UTs, national + state boards,
   Class 1-10 for national boards, a starter subject catalog, the
   achievement catalog, default system settings, AI Tutor prompt
   templates) - idempotent via `upsert`/find-then-create patterns
   throughout (confirmed: 20+ such call sites), safe to run repeatedly,
   safe in any environment including production.
2. **7 demo accounts** (1 admin - the bootstrap super admin - 1 teacher,
   5 students), with passwords that default to fixed, **publicly
   documented** values (`docs/DEMO_CREDENTIALS.md`) whenever the
   corresponding `*_PASSWORD` env var isn't set.

**Running category 2 against a real production database without setting
every `*_PASSWORD` override is a real security risk** - it would create
real, `ACTIVE` accounts (including a super admin) with a guessable,
public password. Stage L added a code-level guard for this
(`prisma/seed.ts`): **the seed script now refuses to run at all in
`NODE_ENV=production` unless every one of `ADMIN_PASSWORD`,
`TEACHER_PASSWORD`, `STUDENT1_PASSWORD` .. `STUDENT5_PASSWORD` is set**,
throwing a clear error naming exactly which ones are missing. This was
a deliberate, minimal, fail-closed addition - not a change to what the
seed creates, only a guard on the unsafe default.

**Recommendation:** in production, either (a) set all 7 override
env vars to strong unique values before seeding, then immediately change
the super admin's password via normal application use, or (b) skip
running the demo-account portion entirely for a real deployment with
real users (the curriculum-reference portion still needs to run once, to
populate States/Boards/Classes/Subjects - there is currently no
"curriculum-only" seed flag; running the full script with strong
password overrides is the supported path).

---

## 4. Registration + approval live test matrix

**Not executed - no live database.** Exact expected behavior for each
case, to be run once credentials exist:

| Case | Steps | Expected result |
|---|---|---|
| Student registration | `/register/student`, submit valid form | `User.status = PENDING`, `RegistrationRequest` row created, no session issued |
| Teacher registration | `/register/teacher`, submit valid form | `User.status = PENDING`, requested class/subject stored in `RegistrationRequest.requestedDetails`, no real `TeacherAssignment` created yet |
| Admin request | `/register/admin`, submit valid form | `User.status = PENDING`, `role = ADMIN`, `Admin.isSuperAdmin = false` (server-hardcoded, never client-settable) |
| Duplicate username/email | Register again with the same username or email | Rejected with "already taken" message; the rare concurrent-race case (Stage K fix) returns the same friendly message instead of a raw error |
| Curriculum tampering | Submit a `boardId`/`schoolClassId` combination that doesn't actually belong together | Rejected server-side by `validateCurriculumSelection` regardless of what the client sent |
| Pending login | Log in with a PENDING account's correct credentials | `403`, "Your account is awaiting administrator approval." - no session issued |
| Super-admin approves student/teacher | `approveRegistration(requestId)` as any admin | `User.status -> ACTIVE`, `RegistrationRequest.status -> APPROVED` |
| Normal admin approves student/teacher | Same action, as a non-super-admin | Succeeds - student/teacher approval is not super-admin-gated |
| Normal admin approves admin request | `approveRegistration(requestId)` where `requestedRole = ADMIN`, caller is not super admin | Rejected - `requireSuperAdmin()` throws |
| Super admin approves admin request | Same, caller is the super admin | Succeeds, new admin's `isSuperAdmin` remains `false` |
| Self-approval | Admin calls `approveRegistration` on their own request | Rejected (`request.userId === actor.userId` check) |
| Rejection | `rejectRegistration(requestId, reason)` | `User.status -> REJECTED`, reason stored (not shown to the applicant) |
| Rejected login | Log in with a REJECTED account | `403`, "Your registration was not approved." |
| Suspension | `suspendUser(userId)` on an ACTIVE account | `User.status -> SUSPENDED`; **that user's existing session stops working on its very next server action** (Stage K fix - re-verified live, not just via cookie signature) |
| Suspended login | Log in with a SUSPENDED account | `403`, "Your account has been suspended. Please contact an administrator." |
| Reactivation | `reactivateUser(userId)` | `User.status -> ACTIVE`, login succeeds again |
| Suspend an admin (normal admin) | `suspendUser` on an admin, caller is a normal admin | Rejected - `requireSuperAdmin()` throws |
| Suspend the super admin | `suspendUser` on the super admin, any caller including another super admin | Rejected unconditionally, before the super-admin check even runs |
| Self-suspend | Admin calls `suspendUser` on their own id | Rejected |
| Student calls approval action | `approveRegistration` called with a student session | `UnauthorizedError`/`ForbiddenError` - `requireAdminActor()` rejects non-admins |

---

## 5. Storage / Blob live verification checklist

**Not executed - no `BLOB_READ_WRITE_TOKEN`.** Procedure once configured:

1. Admin uploads a small valid PDF via the Study Materials tab.
2. Confirm the file actually appears in the Vercel Blob store (Vercel
   dashboard or `storage.getUrl()`).
3. Confirm a `StudyMaterial` row was created **only after** the Blob
   upload succeeded (`lib/actions/materials.ts`'s `createMaterial` calls
   `storage.upload()` before `prisma.studyMaterial.create()` - if upload
   throws, no row is created).
4. Confirm the row's `boardId`/`schoolClassId`/`subjectId`/`chapterId`
   match what was selected.
5. Publish it; confirm a student in the matching board/class sees it via
   `/materials`; confirm a student in a *different* class does not.
6. Confirm an unpublished material is invisible to all students (there
   is no student-facing "get material by id" endpoint at all - only the
   pre-filtered list, so this should hold structurally, not just by
   omission from the list).
7. Admin unpublishes, then deletes; confirm the `StudyMaterial` row is
   gone and the Blob object is gone (or, if Blob deletion fails, confirm
   the row is still removed - `deleteMaterial` intentionally doesn't let
   a storage-delete failure block the catalog removal, logging instead).
8. **Security:** attempt `createMaterial`/`deleteMaterial` as a student
   session (direct action call, not just hidden UI) - expect
   `ForbiddenError`. Attempt as a teacher for a class/subject they're
   *not* assigned to - expect rejection via the `TeacherAssignment`
   check.
9. Attempt an upload with a disallowed MIME type (e.g. `.exe`) - expect
   rejection before any Blob call (`validateUploadFile`).
10. Attempt an upload over 25MB - expect rejection with the exact limit
    named in the error.
11. Upload a file with a path-traversal-shaped name (e.g.
    `../../etc/passwd.pdf`) - confirm `safeFilename()` strips it to a
    safe basename before it ever reaches the storage key.

If `BLOB_READ_WRITE_TOKEN` is absent (this environment's actual current
state): confirmed instead that `storage.isConfigured === false` and
every upload path returns `StorageNotConfiguredError`'s message rather
than a fake success - see `docs/STEP_3_5.md` Stage I detail for where
this was last directly verified.

---

## 6. Exam / worksheet end-to-end live test plan

**Not executed - no live database.**

### Exam

1. Teacher creates a draft exam for an assigned class/subject.
2. Adds an MCQ question with `correctAnswer` set, a TRUE_FALSE question,
   and a SHORT_ANSWER question (no `correctAnswer` - teacher-graded).
3. Edits a question while still draft; confirms edits are rejected once
   published (`requireDraftOwnedExam`).
4. Publishes. Confirms a student in the target class can now see and
   start it; confirms a student in a different class cannot
   (`schoolClassId` check in `getExamForAttempt`/`startExamAttempt`).
5. Student starts the attempt; confirms `getExamForAttempt` never
   includes `correctAnswer` in its response, at any point before
   submission.
6. Student answers all questions, submits. Confirms MCQ/TRUE_FALSE are
   auto-graded server-side from the stored `correctAnswer`, never from
   anything the client claims about correctness.
7. Student attempts to submit the same exam again - confirms it's
   blocked (`"Already submitted."`).
8. Teacher opens the submission, grades the SHORT_ANSWER question,
   finalizes. Confirms `finalizeExamGrade` refuses to finalize while any
   answer is still unmarked.
9. Student views the result - confirms `correctAnswer` is now visible
   only for auto-graded question types, and only after submission.
10. Confirms `StudentTopicProgress`/`WeaknessProfile`/`StrengthProfile`
    recalculate after grading (`refreshStudentAnalytics`, best-effort,
    logged on failure - see Stage K detail).
11. **Cross-user:** a second teacher attempts to view/grade the first
    teacher's exam (direct action call with the real examId) - expect
    `ForbiddenError` (`requireOwnedExam` checks `exam.teacher.userId`).
12. **Cross-user:** a second student attempts to view the first
    student's submission/result - structurally impossible via the
    exposed actions, since every student-facing query is scoped to
    `{ studentId: <own> }`, not by a client-supplied submission id.

### Worksheet

1. Teacher creates a worksheet for an assigned class/subject, optionally
   attaches a file, saves as unpublished.
2. Publishes; confirms student visibility follows the same
   `isPublished` + `schoolClassId` rule as materials/exams.
3. Student submits; confirms `submitWorksheet` upserts (not duplicates)
   on a second submission attempt from the same student.
4. Teacher grades: submits a score/maxScore. Confirms the Stage K bounds
   check rejects a negative score, a score exceeding maxScore, and a
   non-finite value, with a clear message and no row written.
5. Confirms grading a submission for a worksheet the teacher doesn't own
   is rejected (`worksheet.teacher.userId` check).

---

## 7. Analytics + AI live test plan

### Analytics

After generating the real exam/worksheet activity above, verify (all
computed server-side, in `lib/actions/analytics.ts`/`lib/analytics/*`/
`lib/actions/teacher-analytics.ts`/`lib/actions/admin-analytics.ts` -
never client-computed):

- `/performance` - overall %, average score, strongest/weakest subject
  reflect the real graded submissions, not the pre-existing Step 1/2
  mock numbers.
- `/weak-areas` / `/strengths` - topics only appear once the Stage E
  thresholds are met (mastery `<50%`/`>=80%` with the minimum attempt
  counts) - never off a single answer.
- `/results` - matches `listResultsForStudent()`'s real rows exactly.
- Dashboard real-data section, Learning Path, Daily Planner analytics -
  completion percentages match real `StudyPlanItem`/`DailyPlannerTask`
  counts, not placeholders.
- Activity heatmap - real days only, from real `ExamSubmission`/
  `WorksheetSubmission`/completed `DailyPlannerTask` timestamps.
- Teacher class/topic-difficulty analytics - scoped to the teacher's own
  `TeacherAssignment` + owned exams only.
- Per-question exam analytics - correctness/marks derived from real
  `ExamAnswer` rows for that specific exam only.
- Admin platform analytics - real `.count()` aggregates, no individual
  student/user record exposed in the summary.

**No hardcoded/mock numbers should appear anywhere in these specific
real-data sections** - the pre-existing Step 1/2 mock widgets elsewhere
in the app (documented throughout `docs/STEP_3_5.md`) are a separate,
intentionally-preserved concern and are not part of this check.

### AI Tutor

Only with real `AI_PROVIDER=gemini` + `GEMINI_API_KEY`:

- Create a conversation, send a message, confirm a real Gemini response
  is generated and persisted as an `AIMessage`.
- Confirm conversation list/delete are scoped to the logged-in student
  only (`{ id, studentId }` on every query - a crafted id for another
  student's conversation matches nothing, per Stage G's design).
- Confirm curriculum/weak-area/learning-path context is included only
  for that student's own data (`lib/ai/context.ts`), and only the
  data-minimized fields documented in `docs/ARCHITECTURE.md` section 4 -
  no name/email/phone/other-student data.
- Trigger a provider error (e.g. temporarily invalid key) - confirm the
  student sees a safe, generic error, never a raw provider error.
- Send messages rapidly - confirm the in-memory rate limiter
  (documented single-process limitation, `lib/ai/rate-limit.ts`) engages.
- Confirm `retryLastReply` never duplicates the student's original
  message (Stage G design, re-verify live).
- Confirm `GEMINI_API_KEY` never appears in any client-side response or
  bundle (already confirmed absent from built client chunks - see
  `docs/STEP_3_5.md` Stage K/L detail; this is the live-request-time
  equivalent of that static check).
- Confirm `AI_PROVIDER=mock` cannot be used in production
  (`lib/ai/provider.ts` already refuses it when `NODE_ENV=production` -
  re-verify live only if actually testing this path in a
  production-configured environment).

If no AI provider is configured (this environment's actual current
state): confirmed instead that `/ai-tutor` shows "AI Tutor is not
configured yet" and no generation is attempted - see `docs/STEP_3_5.md`
Stage G/H detail.

---

## 8. Production smoke-test matrix

| Area | Test | Expected | Live-tested? |
|---|---|---|---|
| Auth | Invalid credentials | Generic "Invalid username or password for that role." | Not yet - no live DB |
| Auth | Pending account login | `403`, pending message | Not yet |
| Auth | Suspended account login | `403`, suspended message | Not yet |
| Auth | Active account login | Session issued, redirected to role home | Not yet (fallback-auth equivalent tested throughout Stages F-L) |
| Auth | Suspended mid-session | Next server action fails (Stage K fix) | Not yet |
| Auth | Session older than 7 days (forged `iat`) | Rejected server-side, not just by cookie expiry | **Yes - executed directly against `lib/auth/session.ts` this stage (see `docs/STEP_3_5.md` Stage L detail)** |
| Registration | Student | `PENDING` | Not yet |
| Registration | Teacher | `PENDING` | Not yet |
| Registration | Admin request | `PENDING`, `isSuperAdmin=false` | Not yet |
| Admin | Approve | Status -> `ACTIVE` | Not yet |
| Materials | Upload | Stored in Blob + DB | Not yet - no Blob token |
| Materials | Publish | Visible to matching students only | Not yet |
| Exam | Create | `DRAFT` | Not yet |
| Exam | Publish | Visible to target class only | Not yet |
| Exam | Submit | Auto-graded/pending review | Not yet |
| Worksheet | Submit | Pending grade, no duplicate row | Not yet |
| Analytics | Progress | Real values from real rows | Not yet |
| AI | Generation | Persisted assistant response | Not yet - no provider key |
| Security | Cross-user access (exam/worksheet/conversation) | Denied | Not yet (code-level audit confirms the checks exist - see Stage K/L detail) |
| Security | Cross-role access (`/teacher`, `/admin` as student) | Redirected to own home | **Yes - re-verified via fallback auth this stage and every prior stage** |
| Config | Production, no `SESSION_SECRET` | Fails closed, generic 500, no leak | **Yes - `next start` run, Stage I, re-confirmed unchanged Stage K** |
| Config | Production, no `DATABASE_URL` | Demo login refused, `503` safe message | **Yes - `next start` run, Stage I, re-confirmed unchanged Stage K** |

---

## 9. Production failure-mode reference

| Condition | Behavior |
|---|---|
| Database unavailable | `DatabaseUnavailable` component on every affected page; login fails closed in production (see above), falls back to demo accounts in development only |
| Blob unavailable | `StorageNotConfiguredError`, clear inline message, no fake success |
| AI provider unavailable | "AI Tutor is not configured yet" state, composer disabled |
| Migration missing/not applied | Every query fails the same as "database unavailable" - Prisma surfaces a relation-does-not-exist error, caught by the same try/catch -> `DatabaseUnavailable` pattern |
| Invalid environment (e.g. malformed `DATABASE_URL`) | Prisma throws at query time; caught the same way as "unreachable" |
| Expired/invalid session | Treated as logged out; protected routes redirect to `/login` |
| Suspended account (existing session) | Next server action fails via `getCurrentSession()`'s status re-check (Stage K) |
| Malformed request (bad ID, wrong shape) | Zod validation failure or a not-found result - never a raw exception with implementation detail |
| Provider timeout (AI) | Mapped to `AI_PROVIDER_ERROR`, safe generic message, logged server-side with status/message only, never the prompt content |
| Duplicate submission (exam/worksheet) | Blocked with a clear "already submitted" message, no duplicate row |
| Duplicate registration | Clear "already taken" message (including the narrow race case, Stage K) |

No raw stack traces, SQL, or secret values are ever returned to a
client in any of the above - server actions only ever return `.message`
from the app's own typed error classes; anything else is re-thrown and
redacted by Next.js's built-in Server Action production error handling.

---

## 10. Rollback guidance

Nothing in this project has ever been deployed, so there is no live
rollback to perform yet - this section is the procedure to follow the
first time something needs to be undone after a real deployment exists.

**Application code (Vercel deployment):**
- Vercel keeps every previous deployment. Roll back instantly from the
  Vercel dashboard (Deployments -> select a prior one -> Promote to
  Production), or `vercel rollback` from the CLI. This does not touch the
  database - a code rollback alone is always safe.

**Database migrations:**
- Prisma has no automatic "down" migration. Before applying a new
  migration in production, ensure it is additive/backward-compatible
  wherever possible (add columns/tables nullable-or-defaulted rather than
  dropping/renaming in the same release) so that rolling the *application*
  back a version continues to work against the *new* schema.
- If a migration must be reverted, write and review a new forward
  migration that undoes it (e.g. drop the added column) - never hand-edit
  `_prisma_migrations` or delete a migration directory after it has been
  applied to a real database. Test the reverting migration's SQL with
  `npx prisma migrate diff` the same offline way the initial migration was
  generated (see Section 2) before running `npm run db:deploy`.
- Take a database snapshot/backup (via your Postgres provider, e.g. Neon's
  point-in-time restore) before every `npm run db:deploy` against
  production - this is the actual safety net for a migration that turns
  out to be destructive in practice, not just in review.

**Seed data:**
- `npm run db:seed` is idempotent for curriculum reference data (upserts),
  so re-running it after a partial failure is safe. It is **not** safe to
  re-run in a way that recreates already-existing demo accounts with new
  passwords - if demo/bootstrap accounts need new passwords post-seed,
  change them through the app (admin user management) or directly via a
  reviewed one-off script, not by re-seeding.

**Storage (Blob):** uploaded files are never deleted by a rollback -
`delete` only happens through the app's own authorized worksheet/material
delete actions. A code rollback that removes a feature referencing a Blob
file leaves the file orphaned (safe, just unused), never inaccessible.

**Sessions:** rolling back `SESSION_SECRET` invalidates every existing
session (all users are logged out) since old cookies were signed with a
different secret - expected and safe, not a rollback bug.

---

## 11. Dependency & audit status (Stage N)

`npm audit` reported 14 high-severity advisories as of Stage N. 3 were
fully fixed via `npm audit fix` (non-breaking, applied): `brace-expansion`,
`js-yaml`, `nanoid`. A 4th, `postcss`, was **partially** fixed the same
way - the project's own top-level `postcss` (used by `postcss.config.js`/
Tailwind) was bumped to `8.5.26` (past the vulnerable `<=8.5.22` range),
but a second, nested copy at `node_modules/next/node_modules/postcss`
(`8.4.31`, bundled and pinned by Next.js 14.2.35's own internal build
tooling, never invoked by this project's own code) remains vulnerable
and can only be updated by upgrading Next itself. The remaining
advisories are intentionally **deferred**, not ignored - each requires a
major-version upgrade that is out of scope for a routine audit pass and
needs its own dedicated migration/testing effort:

| Package | Advisory | Why deferred |
|---|---|---|
| `deepmerge-ts` (via `@prisma/config`) | stack exhaustion on recursive merges | Fix path resolves to `prisma@6.12.0` - a **downgrade** from the deliberately-pinned `6.19.3` (see `docs/DATABASE.md` "Stack"), not a real fix. Dev-tooling only (Prisma's own config loader), not reachable by any request this app serves. |
| `glob` (via `eslint-config-next`) | CLI command injection via `-c`/`--cmd` | Requires `eslint-config-next@16.3.2` (major). Lint-only dev tooling; the vulnerable code path (the `glob` CLI's shell flag) is never invoked by this project's build/lint. |
| `minimatch` (via `@typescript-eslint`) | ReDoS in pattern matching | Same `eslint-config-next` major bump as above. Dev-only (ESLint's own file matching). |
| `next` | multiple DoS/XSS/SSRF/cache-poisoning advisories | Fix is `next@16.3.2` - a **two-major-version jump** from the pinned `14.2.35`. A framework upgrade of this size needs its own reviewed, tested stage, not a side effect of a dependency audit. |
| `postcss` (nested copy inside `next`) | source-map/XSS advisories | The project's own top-level `postcss` is already patched (see above); only Next's internally-bundled copy remains, and resolves via the same `next` major bump. |

Re-run `npm audit` after any future dependency change to confirm this
list hasn't grown, and revisit it explicitly (as its own stage, with
full regression testing) before treating the Next.js major-version
upgrade as routine maintenance.
