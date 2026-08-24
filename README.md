# TeachAI (mAITeacher)

A personalized AI teacher platform — built to feel like Duolingo's motivation, Khan Academy's clarity, Notion's clean structure, and ChatGPT's conversational polish, all in one product.

The app guides a student through a subject using **Bloom's Revised Taxonomy** (Remember → Understand → Apply → Analyze), tracks strengths/weaknesses, generates personalized assignments and practice papers, and provides separate portals for **Students, Teachers, and Admins** (with an early-stage Parent view). The admin-managed side of the product (Board type, Class 1–10 configuration, exam scheduling) targets K-10 schooling; the pre-existing student self-serve flow (onboarding, lessons, practice papers) additionally supports Class 11/12, college and university personas.

This build runs on a **typed mock-data layer** plus a **demo authentication layer** — there is no live database or LLM API yet. `prisma/schema.prisma` and [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) describe how to wire up a real backend (Postgres + Prisma + Redis + an LLM API) later without changing the UI.

```
Next.js frontend  →  lib/mock-data/* (typed sample data)  →  Demo auth / session (lib/auth, middleware.ts)
```

## Tech stack

- Next.js 14 (App Router) + React + TypeScript
- Tailwind CSS (indigo/violet + green/amber tokens, full dark mode)
- `recharts` (charts), `framer-motion` (animation), `lucide-react` (icons), `next-themes` (dark mode)
- `clsx` / `tailwind-merge` (class merging), `date-fns` (dates)
- Prisma 6.x + PostgreSQL — schema/tooling written (Stage A, see below), not yet connected or queried by any page

## Current status

**Step 1 — Demo authentication & role-based routing: COMPLETE**
- Role-selection-first login (`/login`): pick Student / Teacher / Admin, then sign in.
- Session is a signed (HMAC-SHA256), httpOnly cookie (`lib/auth/session.ts`) — no external auth provider yet.
- `middleware.ts` enforces route protection server-side: unauthenticated visitors are redirected to `/login`; each role is confined to its own area (`/admin`, `/teacher`, or the student pages) and bounced back to its own dashboard on a mismatch; a returning user with a valid session who hits `/login` is sent straight to their dashboard instead of re-selecting a role.
- Self-registration (`/register` and role-specific `/register/student`, `/register/teacher`, `/register/admin`) is also public, database-only (Stage F, see below) — new accounts land `PENDING` until an admin approves them.
- Logout (`POST /api/auth/logout`) clears the session.
- Centralized `Role` type (`lib/auth/users.ts`) and centralized `Class 1–10` config (`lib/classes.ts`) — no scattered role/class string literals.

**Step 2 — Role dashboards: COMPLETE**
- **Student** (`/dashboard` + full nav) — tasks, exam countdowns, study plan, subject progress, weak/strong topics, streak, Bloom-level progress, weekly/monthly charts, heatmap, notifications, plus the full Subjects → Chapters → Topics → Lesson flow, AI Tutor Chat, Practice Papers, Performance, Weak Areas, Achievements, Calendar, Assignments and Settings pages described below.
- **Teacher** (`/teacher`) — class/subject selector, class management, AI-assisted exam builder, material upload (with simulated topic extraction), class-wide weak-concept summary, a marks-entry **Grade Submissions** foundation, and per-student analytics.
- **Admin** (`/admin`) — platform analytics, **Board Type** (CBSE/ICSE/State Board) + **Class 1–10** toggles, a **Study Materials** upload foundation, an **Exam Schedule** builder (subject/chapter/date/marks), plus pre-existing Users, Subjects & Curriculum, Prompt Templates, System Settings and Logs tabs.

All of the above (marks, uploads, scheduled exams, toggled settings) is React state scoped to the current session — nothing is persisted to a database yet, by design.

**Step 3-5 — real backend, academic workflows, AI tutor, production hardening: IN PROGRESS.**
Being built as reviewed, sequential stages (A through I) rather than one large change — see [`docs/STEP_3_5.md`](docs/STEP_3_5.md) for the full stage-by-stage tracker. Stages A/B (database schema, bcrypt auth) and C/D/E (study materials, real exam creation/taking/grading, progress/weak-area/strength engines, learning path, daily planner) are code-complete, type-checked against the real Prisma client, and browser-tested via the demo-account fallback — but **no query has ever executed against a live database** (none is connected yet). Every new page shows a graceful "database not connected" state rather than crashing or faking data — see [`docs/DATABASE.md`](docs/DATABASE.md).

New routes this round: `/materials` (study materials/textbook), `/exams` + `/exams/[id]/attempt` + `/exams/[id]/results` (real exams, student side), `/results` (result history), `/teacher/exams` + `/teacher/exams/[id]` (teacher exam creation, question builder, grading).

**Stage F — registration + account approval: code-complete, not yet connected.** Student/teacher/admin-request self-registration (`/register/*`), an `AccountStatus` (PENDING/ACTIVE/REJECTED/SUSPENDED) gate on login, and an admin approval workflow (`/admin` → Users tab: approve/reject/suspend/reactivate) with a protected super-admin account that only it can approve/manage other admins. Same DB-connection caveat as every other stage above — see [`docs/STEP_3_5.md`](docs/STEP_3_5.md#stage-f-detail).

## Demo accounts

7 demo users (5 students, 1 teacher, 1 admin) are hardcoded for local/dev use — **development/demo only, not production credentials.** See [`docs/DEMO_CREDENTIALS.md`](docs/DEMO_CREDENTIALS.md) for the full username/password table and how login works under the hood.

## Getting started

```bash
npm install
npm run dev
```

Open http://localhost:3000 and sign in from `/login` using a demo account from `docs/DEMO_CREDENTIALS.md`.

Other available commands (from `package.json`):

```bash
npm run build   # production build
npm run start   # run a production build
npm run lint    # ESLint (next lint)
```

There is no dedicated `typecheck` or `test` script yet; run `npx tsc --noEmit` to type-check the project.

Database commands (see [`docs/DATABASE.md`](docs/DATABASE.md) — require `DATABASE_URL`/`DIRECT_URL` to be set, which isn't the case yet on this deployment):

```bash
npm run db:migrate   # apply schema changes locally (creates migration history)
npm run db:deploy    # apply existing migrations in production
npm run db:seed      # seed states/boards/classes/subjects (see docs/BOARDS.md)
npm run db:studio    # browse the database visually
```

## Environment variables

See [`.env.example`](.env.example). For the current demo auth layer:

- `SESSION_SECRET` — signs the session cookie; set a long random value for any real deployment.
- `ADMIN_PASSWORD`, `TEACHER_PASSWORD`, `STUDENT1_PASSWORD`…`STUDENT5_PASSWORD` — optional overrides for the demo account passwords.

For the database (not connected yet, see `docs/DATABASE.md`):

- `DATABASE_URL` — pooled Postgres connection string, used by the app at runtime.
- `DIRECT_URL` — non-pooled connection string, used only by migrations/seeding.

For file storage (Stage C — study materials, worksheets, exam papers):

- `BLOB_READ_WRITE_TOKEN` — Vercel Blob token. Without it, uploads return a clear "storage not configured" error instead of failing silently; the app still builds and runs.

AI Tutor (Stage G, `lib/ai/*`): `AI_PROVIDER` selects the active provider (`gemini` is the only real one implemented; `openai` is reserved for later; `mock` is local-dev-only and refused in production). `GEMINI_API_KEY` (and optional `GEMINI_MODEL`) is read only when `AI_PROVIDER=gemini`. `OPENAI_API_KEY` is reserved, not read by any code yet. Leaving `AI_PROVIDER` unset is fully supported — the app builds and runs, and `/ai-tutor` shows a "not configured yet" state instead of crashing.

No real secrets are committed to the repo.

## What's built (feature detail)

- **Landing page** (`/`) — hero, features, how it works, AI demo transcript, testimonials, Bloom's-taxonomy journey, pricing, FAQ, footer.
- **Onboarding** (`/onboarding`) — grade, curriculum, board, subjects (pre-existing self-serve flow, separate from the role-login portal above).
- **Subjects → Chapters → Topics → Lesson** (`/subjects`) — topic pages (theory, examples, formulae, flashcards, revision notes) and an interactive lesson flow that walks through all 4 Bloom levels with instant feedback and reteach-on-struggle.
- **AI Tutor Chat** (`/ai-tutor`) — originally canned Socratic-style logic (Step 1/2); upgraded in Stage G to a real, database-backed, multi-conversation tutor behind a provider-agnostic abstraction (Gemini first) — see "Stage G" below.
- **Practice Papers** (`/practice-papers`) — chapter/weekly/monthly tests, mock exams, a custom paper generator, a full attempt flow (7 question types + timer + navigator), and a detailed results/evaluation page.
- **Performance, Weak Areas, Achievements, Calendar, Study Plan + Exam Planner, Assignments, Settings** — fully built with real charts and working interactions.

## Project structure

```
app/
  (marketing)/            landing page at "/"
  onboarding/              self-serve onboarding flow -> /dashboard
  login/                   role-selection + credentials login page
  api/auth/                login/logout route handlers (session cookie)
  (app)/                   authenticated shell (sidebar + topbar), gated by middleware.ts
    dashboard/ subjects/ study-plan/ assignments/ practice-papers/
    performance/ weak-areas/ strengths/ achievements/ calendar/ ai-tutor/ settings/
    parent/ teacher/ admin/
middleware.ts              session check + role-based route protection
components/
  ui/            hand-built shadcn-style primitives
  layout/        sidebar, topbar, mobile nav, toast provider
  charts/        recharts wrappers (weekly/monthly, radar, bloom, heatmap)
  admin/ teacher/ dashboard/ marketing/ lesson/ ai-tutor/ practice-papers/
  performance/ weak-areas/ achievements/ calendar/ study-plan/
  assignments/ settings/ parent/ onboarding/
lib/
  auth/          demo session (session.ts) + hardcoded user directory (users.ts)
  prisma.ts      Prisma Client singleton (Stage A - not imported anywhere yet)
  types.ts       shared domain types
  classes.ts     centralized Class 1-10 + board-type config (superseded progressively by prisma/schema.prisma's Board/SchoolClass)
  mock-data/     typed sample data (21 files: students, teacher, admin, subjects, etc.)
  socratic-engine.ts   Socratic response engine - now reused as the AI Tutor's opt-in `mock` provider (Stage G)
  ai/            AI Tutor provider abstraction (Stage G) - types/provider/errors/prompts/context/rate-limit
  actions/tutor.ts     AI Tutor conversation server actions (Stage G)
  nav.ts icon-map.tsx utils.ts
prisma/
  schema.prisma  full relational schema (Stage A - validated/generates, not connected to a live DB yet)
  seed.ts        seeds states/boards/classes/subjects/achievements/settings (no user accounts - see docs/DATABASE.md)
docs/
  ARCHITECTURE.md      how mock data maps to a real backend + the 4 core algorithms
  DEMO_CREDENTIALS.md  demo login table + how the auth layer works
  STEP_3_5.md          Step 3-5 stage-by-stage status tracker
  DATABASE.md          database setup, migration, and seeding steps
  BOARDS.md            Indian states/boards reference data
```

## Current limitations

Not yet implemented — explicitly out of scope until a real backend exists:

- Production authentication provider (this is a hand-rolled demo session, not NextAuth/OAuth/etc.)
- PostgreSQL database and Prisma persistence (`prisma/schema.prisma` is written and validated as of Stage A, but not connected to a running database or queried by any page yet — see `docs/DATABASE.md`)
- Persistent user management (invites, password reset, account creation)
- Real file storage for uploaded materials/worksheets/exam papers
- Persistent study materials, exam schedules, marks, and settings (all reset when the session ends)
- Real exam evaluation (grading UI exists; scoring is manual/mock)
- Persistent student progress across sessions
- A real GenAI API behind the AI Tutor is implemented (Stage G, Gemini via `lib/ai/*` — see below), but not yet connected (no `GEMINI_API_KEY` configured anywhere).
- Production-grade user administration and audit logging

## Future roadmap

Steps 3-5 are underway as nine reviewed stages (A-I) — see [`docs/STEP_3_5.md`](docs/STEP_3_5.md) for current status of each:

- **Step 3 — Backend + Database + Persistent Data.** Stages A-F (database schema, real auth, study materials, exam creation/taking/grading, progress/learning-path engines, registration + account approval) are all code-complete and type-checked against the real Prisma client, but none has ever executed against a live database — see [`docs/STEP_3_5.md`](docs/STEP_3_5.md) for the stage-by-stage detail.
- **Step 4 — Real AI / GenAI Tutor + Evaluation.** Stage G is code-complete, not yet connected — provider-agnostic abstraction (`lib/ai/*`), Gemini as the first real provider, conversation persistence, and a real `/ai-tutor` UI. See [`docs/STEP_3_5.md`](docs/STEP_3_5.md#stage-g-detail).
- **Step 5 — Production User Management + Advanced Learning Features.** Stage H (analytics, reporting & performance) is code-complete, not yet connected — real student/teacher/admin analytics across `/performance`, `/weak-areas`, the new `/strengths`, `/teacher`, `/teacher/exams/[examId]`, and the admin dashboard, with no schema changes. See [`docs/STEP_3_5.md`](docs/STEP_3_5.md#stage-h-detail). Stage I (real auth provider, notifications/audit-log UI, production hardening) not started.

## Known gaps in the mocked UI

- All AI behavior (lesson explanations, Socratic tutor, evaluation, weakness detection) is mocked with realistic canned logic — swap in a real LLM once you have an API key (see `docs/ARCHITECTURE.md`).
- `app/layout.tsx` uses a system font stack instead of `next/font/google` Inter (this build environment couldn't reach Google Fonts) — swap it in once deployed with normal internet access.
- Custom-generated practice papers/attempts persist to `sessionStorage` only, not a real database.
- A handful of non-flagship topics use templated (not hand-authored) lesson content.
