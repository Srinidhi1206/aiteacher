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

## 4. Conversation Memory & Embeddings (AI Tutor Chat)

- **Mocked as:** a fixed transcript per conversation in
  `lib/mock-data/ai-tutor.ts` plus `lib/socratic-engine.ts` for canned
  Socratic-style responses.
- **Real version:** each `ChatMessage` is embedded (pgvector) on write; when
  the student sends a new message, the API route retrieves the top-k most
  relevant prior turns (across the current and past conversations on that
  topic) instead of naively replaying the full history, then chains that
  retrieved context into the "Socratic Tutor Prompt" so the tutor "remembers"
  earlier misconceptions without an unbounded context window.

## 5. Known Gaps in This Build

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
