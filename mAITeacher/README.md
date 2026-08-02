# mAITeacher

A personalized AI teacher platform for students of any grade — built to feel like Duolingo's motivation, Khan Academy's clarity, Notion's clean structure, and ChatGPT's conversational polish, all in one product.

The app guides a student through a subject using **Bloom's Revised Taxonomy** (Remember → Understand → Apply → Analyze), tracks strengths/weaknesses, generates personalized assignments and practice papers, and includes dashboards for Students, Parents, Teachers, and Admins.

This build uses a **typed mock-data layer** instead of a live database or LLM API, so the entire UI/UX is fully functional and clickable out of the box. `prisma/schema.prisma` and `docs/ARCHITECTURE.md` describe how to wire up a real backend (Postgres + Prisma + Redis + an LLM API) later without changing the UI.

## Tech stack

- Next.js 14 (App Router) + TypeScript
- Tailwind CSS (indigo/violet + green/amber tokens, full dark mode)
- `next-themes`, `lucide-react`, `recharts`, `framer-motion`

## Getting started

```bash
npm install
npm run dev
```

Open http://localhost:3000. Other scripts: `npm run build`, `npm run start`, `npm run lint`.

## What's built

- **Landing page** (`/`) — hero, features, how it works, AI demo transcript, testimonials, Bloom's-taxonomy journey, pricing, FAQ, footer.
- **Onboarding** (`/onboarding`) — grade, curriculum, board, subjects.
- **Student dashboard** (`/dashboard`) — tasks, exam countdowns, study plan, subject progress, weak/strong topics, streak, Bloom-level progress, weekly/monthly charts, heatmap, notifications.
- **Subjects → Chapters → Topics → Lesson** (`/subjects`) — topic pages (theory, examples, formulae, flashcards, revision notes) and an interactive lesson flow that walks through all 4 Bloom levels with instant feedback and reteach-on-struggle.
- **AI Tutor Chat** (`/ai-tutor`) — Socratic chat that never gives direct answers, only guiding questions and hints.
- **Practice Papers** (`/practice-papers`) — chapter/weekly/monthly tests, mock exams, a custom paper generator, a full attempt flow (7 question types + timer + navigator), and a detailed results/evaluation page.
- **Performance, Weak Areas, Achievements, Calendar, Study Plan + Exam Planner, Assignments, Settings** — all fully built with real charts and working interactions.
- **Parent, Teacher, Admin dashboards** — reachable from "Other Dashboards" in the sidebar.

## Project structure

```
app/
  (marketing)/            landing page at "/"
  onboarding/              onboarding flow -> redirects to /dashboard
  (app)/                   authenticated shell (sidebar + topbar)
    dashboard/ subjects/ study-plan/ assignments/ practice-papers/
    performance/ weak-areas/ achievements/ calendar/ ai-tutor/ settings/
    parent/ teacher/ admin/
components/
  ui/            hand-built shadcn-style primitives
  layout/        sidebar, topbar, mobile nav, toast provider
  charts/        recharts wrappers (weekly/monthly, radar, bloom, heatmap)
  dashboard/ marketing/ lesson/ ai-tutor/ practice-papers/
  performance/ weak-areas/ achievements/ calendar/ study-plan/
  assignments/ settings/ parent/ teacher/ admin/
lib/
  types.ts        shared domain types
  mock-data/      typed sample data (persona: Srinidhi, Class 11 CBSE)
  socratic-engine.ts   mock Socratic response engine for AI Tutor
  nav.ts icon-map.tsx utils.ts
prisma/schema.prisma   reference relational schema for a future real backend
docs/ARCHITECTURE.md   how mock data maps to a real backend + the 4 core algorithms
```

## Known gaps

- All AI behavior (lesson explanations, Socratic tutor, evaluation, weakness detection) is mocked with realistic canned logic — swap in a real LLM once you have an API key (see `docs/ARCHITECTURE.md`).
- `app/layout.tsx` uses a system font stack instead of `next/font/google` Inter (this build environment couldn't reach Google Fonts) — swap it in once deployed with normal internet access.
- Custom-generated practice papers/attempts persist to `sessionStorage` only, not a real database.
- A handful of non-flagship topics use templated (not hand-authored) lesson content.
