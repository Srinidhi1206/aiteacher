# mAITeacher - Architecture Notes

Practical reference for how the current mock-data build maps to a real
production backend. Kept short and skimmable on purpose.

## 0. Step 1 & Step 2 Status

**Step 1 - Web portal, demo auth, role-based routing: COMPLETE.**
- `/login` implements the role-selection-first flow (Student / Teacher /
  Admin -> username/password), backed by `POST /api/auth/login`.
- Sessions are a signed (HMAC-SHA256), httpOnly cookie
  (`lib/auth/session.ts`) - no external auth provider yet, see
  [DEMO_CREDENTIALS.md](./DEMO_CREDENTIALS.md).
- `middleware.ts` enforces route protection server-side (not just hidden
  nav links): unauthenticated visitors are redirected to `/login`; each
  role is confined to its own area (`/admin` for admins, `/teacher` for
  teachers, and the student pages - `/dashboard`, `/subjects`,
  `/study-plan`, `/assignments`, `/practice-papers`, `/performance`,
  `/weak-areas`, `/achievements`, `/calendar`, `/ai-tutor`, `/settings` -
  for students) and bounced back to the visitor's own dashboard on a
  mismatch; a returning user with a valid session who hits `/login` is
  redirected straight to their dashboard instead of reselecting a role.
- `POST /api/auth/logout` clears the session cookie.
- Centralized `Role` type in `lib/auth/users.ts`, centralized `Class
  1-10` config in `lib/classes.ts` - no scattered role/class string
  literals for this layer.
- 7 demo accounts (5 students, 1 teacher, 1 admin) per the product spec.

**Step 2 - Role dashboards + admin/teacher foundations: COMPLETE.**
- Student dashboard (`/dashboard` + full nav: Subjects, Study Plan,
  Assignments, Practice Papers, Performance, Weak Areas, Achievements,
  Calendar, AI Tutor Chat, Settings) - pre-existing, unchanged, now gated
  behind the session.
- Teacher dashboard (`/teacher`): class/subject selector, class
  management, exam builder, material upload, weak-concept summary,
  student analytics, and a grade-submissions (marks entry) card - all
  mock-state/session-only.
- Admin dashboard (`/admin`): platform analytics, Board Type (CBSE/ICSE/
  State Board) + Class 1-10 toggles, Study Materials upload, Exam
  Schedule (subject/chapter/date/marks), Users, Subjects & Curriculum,
  Prompt Templates, System Settings, Logs - all mock-state/session-only.
- Session payload carries `class` for students and
  `assignedClasses`/`subjects` for teachers as a foundation for future
  class-scoped filtering once real data exists.

**Not yet implemented (explicitly out of scope for Step 1/2):** production
auth provider, Postgres/Prisma persistence, real file storage for uploads,
real exam evaluation, persistent student progress across sessions, a real
GenAI API behind the AI Tutor, real-time data, and production user
management (invites, password reset, etc.). See "Known Gaps" below.

**Step 3-5 - real backend, academic workflows, AI tutor, production
hardening: IN PROGRESS, staged.** Full status, stage-by-stage, lives in
[STEP_3_5.md](./STEP_3_5.md). Short version: Stage A (database schema +
Prisma tooling) is written and verified but not yet connected to a live
database or to any page - the app still runs entirely on `lib/mock-data/*`
as described below, unchanged. See [DATABASE.md](./DATABASE.md) for the
schema/migration/seed details and [BOARDS.md](./BOARDS.md) for the Indian
states/boards reference data.

## 1. System Overview

**Today (this build):**

```
Next.js 14 App Router (client + server components)
        |
        +--> middleware.ts + lib/auth/*  <-- demo session auth + route guards
        |
        v
lib/mock-data/*.ts  <-- single source of truth for all UI state
        |
        v
lib/types.ts        <-- shared domain model (Student, Subject, Topic,
                          Paper, Assignment, WeaknessProfile, etc.)
```

Every page reads from `lib/mock-data/*`, and a handful of client-only stores
(`lib/attempt-store.ts`, `lib/custom-papers-store.ts`) use `sessionStorage`
to persist in-session state (paper attempts, custom-generated papers).
Login/session/route-protection (Step 1) is real and server-enforced; there
is still no real backend/database behind the app's actual data - this
remains intentional for a front-end-first build.

**Target (future backend):**

```
Next.js API Routes (or a separate Node/Nest service)
        |
        +--> Postgres (Prisma)          - all relational data (see prisma/schema.prisma)
        +--> pgvector (Postgres ext.)   - embeddings for weak-concept clustering,
        |                                  semantic lesson/question retrieval
        +--> Redis                      - sessions, rate limiting, AI job queues
        +--> LLM provider (Claude API)  - lesson generation, Socratic tutor,
                                           question generation, weakness detection
```

(This sketch predates Stage G. What actually got built for the AI Tutor
piece - see section 4 below - is a provider-agnostic abstraction whose
first real implementation is Gemini, not Claude, and no pgvector/Redis:
context is bounded by capturing it once per conversation rather than by
embeddings/retrieval, and rate limiting is an in-memory per-process
counter, not a Redis-backed one. Both remain valid, swappable future
upgrades - see `lib/ai/provider.ts` and `lib/ai/rate-limit.ts`.)

`lib/mock-data/*.ts` files map almost 1:1 to Prisma models in
`prisma/schema.prisma` (e.g. `subjects.ts` -> `Subject`/`Chapter`/`Topic`,
`weak-areas.ts` -> `WeaknessProfile`, `study-plan.ts` -> `StudyPlan` +
`StudyPlanItem` + `ExamPlan`). Swapping mock data for real data means
replacing each `lib/mock-data/*.ts` export with a fetch to an API route that
queries Prisma - component code and types stay the same, since components
already import from the shared `lib/types.ts` interfaces.

## 2. Migration Path (Mock -> Real)

1. Stand up Postgres + Prisma using `prisma/schema.prisma` as the starting
   schema (enable the `vector` extension for pgvector).
2. Add Next.js API routes (`app/api/**/route.ts`) that mirror each
   `lib/mock-data/*.ts` file's exports (e.g. `GET /api/weak-areas`).
3. Replace direct mock imports in Server Components with `fetch`/Prisma
   client calls; keep Client Components on `useSWR`/`react-query` against
   the same API routes so loading/error states are handled once.
4. Move `sessionStorage`-based stores (attempts, custom papers) to real
   `Attempt`/`Paper` rows written via API routes on submit.
5. Introduce auth (NextAuth or Clerk) mapped to the `User`/`Role` model;
   gate `/parent`, `/teacher`, `/admin` routes by role instead of being
   openly linked in the sidebar.
6. Wire the four algorithms below to an LLM + Redis job queue instead of
   hand-authored mock functions.

## 3. The Four Core Algorithms

### Adaptive Learning
- **Mocked as:** static `mastery` and `bloomLevel` fields per topic in
  `lib/mock-data/subjects.ts`; the Lesson flow (`lib/mock-data/lesson-content.ts`)
  presents a fixed question sequence per topic.
- **Real version:** after each `Attempt`, a job re-scores `StudentTopicProgress.mastery`
  using a weighted recency function (recent attempts count more), then asks
  the LLM (via the "Lesson Explanation Prompt") to pick the next Bloom level
  and next best topic given the updated mastery vector - a light form of
  prompt chaining (score -> prompt -> next-step decision -> generation).

### Study Planner
- **Mocked as:** a hand-written day-by-day schedule (`studyPlanSchedule`) and
  a deterministic `generateExamPlan()` function in `lib/mock-data/study-plan.ts`
  that spreads chapters across days using simple ratios (70% study / 15%
  revision / 15% mock+buffer).
- **Real version:** the same shape of output, but generated by chaining: (1)
  pull exam dates + `WeaknessProfile` rows + available hours, (2) prompt an
  LLM to rank topics by urgency (exam weightage x weakness x days-remaining),
  (3) deterministically lay out the ranked topics across the date range,
  (4) re-run nightly as new attempts/exams change the inputs. Determinism
  stays in code; only topic ranking and phrasing come from the LLM.

### Weakness Detection
- **Mocked as:** hand-authored `WeakConcept[]` rows in
  `lib/mock-data/weak-areas.ts` with a fixed `reason` string per concept.
- **Real version:** a scheduled job scans recent `Score` rows per student,
  flags topics with mastery < 50% or 2+ consecutive wrong answers or 14+
  days since last practice (the same three rules described in the
  "How we detect weak areas" banner on `/weak-areas`), then uses topic
  **embeddings** (pgvector) to cluster related wrong answers across
  different questions into a single weak concept with one generated `reason`
  string (via the "Weakness Detection Prompt" template shown in
  `/admin` -> Prompt Templates).

### Bloom Taxonomy Progression
- **Mocked as:** a fixed `currentBloomLevel` per subject and per-topic
  `bloomLevel` values; `components/charts/bloom-level-chart.tsx` renders the
  4-stage progress bar.
- **Real version:** progression through Remember -> Understand -> Apply ->
  Analyze is gated by mastery thresholds per level (e.g. 80%+ average score
  at the current level over the last N questions before unlocking the next).
  Each level-up triggers the "Question Generation Prompt" to produce the next
  batch of questions at the new Bloom level, keeping the question bank
  personalized rather than static.

## 4. AI Tutor (Stage G, see `docs/STEP_3_5.md` "Stage G detail" for the full writeup)

`/ai-tutor` was upgraded in place from the Step 1/2 mock (a fixed
transcript in `lib/mock-data/ai-tutor.ts` plus `lib/socratic-engine.ts`'s
canned Socratic responses) to a real, database-backed tutor - same route,
no duplicate page.

- **Provider abstraction (`lib/ai/*`):** an `AIProvider` interface
  (`generateResponse`) with a Gemini implementation (`@google/genai`) and
  an opt-in, production-refused `mock` implementation that reuses
  `lib/socratic-engine.ts` rather than duplicating its logic. Provider
  choice is entirely `AI_PROVIDER`-env-driven, so adding OpenAI later is a
  new branch in `lib/ai/provider.ts`, not a rewrite.
- **Persistence:** reuses the existing `AIConversation`/`AIMessage`
  models (no new/duplicate models) via `lib/actions/tutor.ts`. Every
  action re-derives the student from the session and scopes every query
  by that student's own id - see the Security section of "Stage G detail"
  in `docs/STEP_3_5.md` for the full authorization walkthrough.
- **Context, bounded and data-minimized (`lib/ai/context.ts`):** a
  conversation's curriculum/performance context is captured once at
  creation (`AIConversation.contextSnapshot`, a field that already
  existed for exactly this) and reused for every message in it, rather
  than re-derived or grown per turn - this is what keeps context bounded,
  not embeddings or retrieval. Only state/board/class/subject/chapter/
  topic names, a mastery percentage, and up to 5 weak/strong topic names
  are ever included - never the student's name, email, or any other PII.
  No vector database, embeddings, or RAG pipeline was built for this
  stage (explicitly out of scope) - `Topic.embedding`/`AIMessage.embedding`
  remain unused `Json?` placeholders for a possible future stage.
- **Prompts:** reuses the existing `PromptTemplate` model
  (`TUTOR_SYSTEM`/`TUTOR_EXPLAIN`/`TUTOR_PRACTICE`/`TUTOR_WEAK_AREA`),
  with a built-in fallback constant per template so a missing database or
  row can never break the tutor.

## 5. Analytics & Reporting (Stage H, see `docs/STEP_3_5.md` "Stage H detail" for the full writeup)

Real analytics for all three roles, layered strictly on top of the Stage
E engines (`lib/analytics/progress.ts`/`weakness.ts`/`strengths.ts`/
`learning-path.ts`) rather than a second calculation layer - every
number shown is either read directly from a persisted
`Student*Progress`/`WeaknessProfile`/`StrengthProfile` row, or a
lightweight aggregate computed in a `lib/actions/*` query module (never
inside a React component).

- **Student analytics flow:** `/performance`, `/weak-areas`, `/strengths`
  are all async Server Components that call `lib/actions/analytics.ts`
  (student identity always re-derived from the session, never from a
  route param) and render real data through the same chart/card
  components the Step 1/2 mock pages already used - `StatGrid`/`StatCard`,
  `SkillRadarChart`, `SubjectPerformanceChart`, `BloomProgressAllChart`,
  `Heatmap` all became prop-driven rather than being rebuilt.
- **Teacher authorization flow:** `lib/actions/teacher-analytics.ts`'s
  three functions (class overview, student table, topic difficulty) all
  gate through `requireOwnedAssignment` (`lib/actions/exams.ts`) - the
  same "does a `TeacherAssignment` row actually exist for this
  teacher+class+subject" check exam creation already relied on. Reading
  an exam's aggregate stats additionally filters by `teacherId`, so a
  class/subject shared across two teachers never leaks one teacher's
  exam data to the other.
- **Admin aggregate analytics:** `lib/actions/admin-analytics.ts`'s
  `getPlatformAnalytics()` is intentionally count-only - `Promise.all` of
  ~25 `.count()`/`.count({where})` calls, never a `findMany` that loads
  individual student/user rows into memory. Gated by the existing
  `requireAdminActor()` (Stage F), reused rather than duplicated.
- **AI/analytics separation:** analytics never calls the AI provider, and
  the AI Tutor never computes analytics - the only coupling is
  presentational, "Ask Tutor" links that pass a real `topicId` (weak
  areas, strengths) or a plain-text prefill (learning path, which has no
  `topicId` in its schema) into `/ai-tutor`'s existing query-param
  handling from Stage G. The tutor's own context builder
  (`lib/ai/context.ts`) still does its own independent, re-scoped lookup
  of that student's weak areas/mastery - it does not trust or reuse
  whatever the analytics page happened to compute.
- **Data sources for activity/Bloom analytics** (no schema change):
  activity heatmap = `ExamSubmission.submittedAt` +
  `WorksheetSubmission.submittedAt` + completed `DailyPlannerTask.date`,
  bucketed into real (possibly zero) daily counts. Bloom-level
  performance = `ExamAnswer -> ExamQuestion.topicId -> Topic.bloomLevel`,
  labeled in the UI as topic-level classification since no question-level
  Bloom field exists in the schema.

## 6. Production Readiness (Stage I, see `docs/STEP_3_5.md` "Stage I detail" for the full writeup)

**Production auth configuration.** Two things that degraded gracefully in
earlier stages now fail closed once `NODE_ENV=production`:

- `lib/auth/session.ts` resolves `SESSION_SECRET` lazily (inside
  `getKey()`, not at module load) - a production process with no
  `SESSION_SECRET` doesn't crash at startup, but the moment a session is
  actually signed or verified it throws, rather than falling back to the
  development secret hardcoded in this file.
- `lib/auth/users.ts`'s `findUser()` only takes the demo-account fallback
  path when `DATABASE_URL` is unset **and** `NODE_ENV !== "production"`.
  In production with no `DATABASE_URL`, it throws
  `AuthConfigurationError`, which `app/api/auth/login/route.ts` catches
  and turns into a generic `503` - never "invalid credentials," and never
  a path that reaches the demo accounts.

**Development fallback authentication - unchanged, still scoped.** The 7
hardcoded demo accounts (`docs/DEMO_CREDENTIALS.md`) remain fully
available whenever `NODE_ENV !== "production"`, regardless of
`DATABASE_URL` - this is what every browser-verification pass in this
repo's history has used, and Stage I doesn't touch that workflow.

**Material storage flow** (`components/admin/study-materials-card.tsx`,
rewired in Stage I from Step 1/2 mock/local state): admin picks
State -> Board -> Class -> Subject -> Chapter -> optional Topic (all via
the existing `lib/actions/curriculum.ts` reads), fills in title/
description/type, and uploads a file. The form calls `createMaterial()`
(Stage C, unchanged) directly - client-side MIME/size checks
(`lib/storage/types.ts`'s `validateUploadFile`/`ALLOWED_MIME_TYPES`/
`MAX_UPLOAD_BYTES`, imported directly rather than re-declared) are UX
only; the server re-validates independently. `StorageNotConfiguredError`
and a missing-database `.catch()` both render an explicit inline message
- never a fake "upload succeeded."

**Teacher worksheet flow** (`/teacher/worksheets`, new in Stage I): a
thin UI over the Stage C `lib/actions/worksheets.ts` actions, which were
already fully authorized and just had no page to reach them from.
`CreateWorksheetForm` only offers class/subject pairs from the teacher's
own `listMyTeacherAssignments()` (Stage D); `createWorksheet` re-validates
that pair against `TeacherAssignment` server-side regardless of what the
client sent. One new action, `updateWorksheet`, was added following the
exact same ownership-check pattern (`worksheet.teacher.userId ===
session.id`) as the pre-existing `setWorksheetPublished`/
`deleteWorksheet` - editing title/instructions/chapter/topic only, not
class/subject (changing those would need a fresh assignment-scope
decision, so that's a new worksheet, not an edit).

**Authorization model - reaffirmed, not changed.** Every mutating action
across the app re-derives its actor from the session
(`getCurrentSession()`/`requireRole()`) and, where the action targets a
specific row (an exam, a worksheet, a conversation, a class/subject
pair), re-checks ownership/assignment against that actor - never a
client-supplied id. This was true before Stage I; Stage I's focused
audit (see `docs/STEP_3_5.md`) re-verified it by reading the relevant
code, not just grepping for patterns, and found no new issues beyond the
two auth-fallback gaps described above.

**Stage J - real infrastructure connection status: none connected.**
Stage J's objective was to make the above genuinely operational against
a real Postgres database, Vercel Blob, and an AI provider wherever
credentials were available. None were: this environment has no
`DATABASE_URL`/`DIRECT_URL`/`BLOB_READ_WRITE_TOKEN`/`SESSION_SECRET`/
`AI_PROVIDER`/`GEMINI_API_KEY`/`OPENAI_API_KEY` configured anywhere. Every
architectural claim in this document remains exactly what it was after
Stage I - a real, typechecked, server-authorized implementation that has
never executed against live infrastructure - and Stage J re-verified that
via a fresh full local/offline verification pass plus a browser
regression pass, not by fabricating a connection. See `docs/STEP_3_5.md`
"Stage J detail" for the complete list of steps that could not be
performed and exactly why.

**Stage K - session freshness, not just session validity.** A real gap
was found and fixed: `getCurrentSession()` (`lib/auth/current-session.ts`)
previously only checked a session cookie's HMAC signature, never the
account's live `AccountStatus` - meaning a suspended or rejected user's
existing cookie kept working for up to 7 days regardless of the
suspension. It now re-checks `User.status === "ACTIVE"` on every call, on
the database-backed path only (a single indexed lookup, dynamically
importing Prisma the same way `lib/auth/users.ts` already does, so the
fallback/demo path - which has no `AccountStatus` concept - is
unaffected). This lives in `getCurrentSession()` specifically because
that's the one choke point every real (Node-runtime) data-touching
operation passes through - `middleware.ts` itself stays database-free (it
runs on the Edge runtime, which can't import Prisma in this project's
configuration) and still only checks the cookie's signature, so a
suspended user's browser can still render a protected page's shell
before the first server action reveals the account is no longer active.
That residual UX gap is accepted, not fixed - no real data is ever
returned through it. Two smaller, unrelated findings from the same audit
pass - a registration duplicate-account race condition and an unvalidated
worksheet-grading score input - are also fixed; see
`docs/STEP_3_5.md` "Stage K detail" for both.

## 7. Known Gaps in This Build

- Authentication (Stage B, see `docs/STEP_3_5.md`) has a real,
  bcrypt-backed database path (`lib/auth/users.ts` -> `prisma.user`), used
  automatically once `DATABASE_URL` is set. Until then - the current state
  of both local dev and the live deployment, since no database is
  connected yet - it falls back to the original 7 hardcoded demo accounts
  with plaintext comparison, exactly as Step 1/2 worked. Session is still a
  hand-rolled signed (not NextAuth/OAuth) cookie - see `lib/auth/session.ts`;
  that part is unchanged and was already reviewed as sound. `/teacher`,
  `/admin`, and the student pages are all server-enforced (`middleware.ts`)
  against the session's role, not just hidden nav links; `/parent` has no
  role restriction yet since "parent" isn't one of the three product roles.
- Registration + account approval (Stage F, see `docs/STEP_3_5.md`) adds
  public self-registration under `/register`, `/register/student`,
  `/register/teacher`, `/register/admin` (`lib/actions/registration.ts`),
  all landing accounts in `AccountStatus.PENDING` until an admin approves
  them (`lib/actions/user-management.ts`, `/admin` -> Users tab). Only the
  one seed-bootstrapped `Admin.isSuperAdmin = true` account may approve/
  reject/suspend/reactivate another admin - no code path anywhere creates
  a second super admin. This is database-only, same as Stage B: the
  fallback demo accounts have no concept of `AccountStatus` and are
  unaffected.
- Analytics/reporting (Stage H, see `docs/STEP_3_5.md`) date-bucketed
  metrics (activity heatmap, planner completion %) use the same
  server-local date convention as the rest of the app (`new Date()` +
  `setHours(0,0,0,0)`, no timezone library) - a student in a timezone
  ahead of the server's clock could see late-night activity attributed to
  the next server-local day. Documented, not fixed, in this stage - see
  the Stage H date-convention note.
- Migration readiness (Stage I, see `docs/DATABASE.md`) - an initial
  migration (`prisma/migrations/20260824190000_initial_schema/`) was
  generated offline from the current schema and is committed, but has
  never been applied to or verified against a real Postgres instance
  (there isn't one). `npm run db:deploy` is the documented, correct
  command to run once real `DATABASE_URL`/`DIRECT_URL` values exist.
- No persistence across page reloads for most interactions (toasts, toggled
  checkboxes, generated exam plans, uploaded materials, entered marks,
  scheduled exams) beyond the current session - by design, since there is
  no backend yet.
- `prisma/schema.prisma` is not connected to a running database yet, but as
  of the Stage A work (see [STEP_3_5.md](./STEP_3_5.md)) it now fully
  models `SchoolClass` (Class 1-10, per-board), `Board`/`State` (the Indian
  board/state hierarchy - see [BOARDS.md](./BOARDS.md)), and
  `ExamSchedule`, superseding the string-only versions in `lib/classes.ts`/
  `lib/types.ts` once pages actually migrate over to it stage-by-stage.
