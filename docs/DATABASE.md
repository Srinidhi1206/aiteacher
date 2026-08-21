# Database (Stages A-E)

Status: **schema, auth, and Stage C/D/E server actions all exist and are
verified (`prisma validate`, `prisma generate`, `tsc --noEmit`, `npm run
build` all pass) - but no query has ever executed against a live
database.** Login falls back to hardcoded demo accounts; every
materials/exam/progress page shows a graceful "database not connected"
state (see `components/database-unavailable.tsx`) instead of pretending
to work. This document describes how to actually turn the database on -
that step hasn't happened yet. See `docs/STEP_3_5.md` for the full
stage-by-stage breakdown of what's built on top of it.

## Stack

- **Postgres** - via Vercel Postgres (Neon-backed) or any Postgres-compatible provider.
- **Prisma 6.x** (`prisma`, `@prisma/client`) - pinned to the 6.x line
  deliberately. Prisma 7 removed the classic `datasource { url = env(...) }`
  pattern in favor of a `prisma.config.ts` + database-specific driver
  adapter (e.g. `@prisma/adapter-neon`). That's real added complexity this
  project doesn't need yet - revisit once you're ready to pick a specific
  adapter for your exact provider. See `prisma/schema.prisma`'s top comment.

## Setting it up

1. **Provision Postgres.** From your Vercel project → Storage tab → Create
   Database → Postgres. (I can't create this for you - it requires your
   Vercel account.)
2. **Copy the connection strings.** Vercel Postgres gives you both a pooled
   and a non-pooled connection string.
3. **Set env vars** (locally in `.env.local`, and in Vercel Project Settings
   → Environment Variables for the deployed app):
   - `DATABASE_URL` - the **pooled** connection string (what the app queries through at runtime).
   - `DIRECT_URL` - the **non-pooled** connection string (what `prisma migrate`/`prisma db seed` use - schema changes can't run through a pgbouncer pool). If your provider only gives you one string, set both to the same value.
4. **Run the first migration:**
   ```bash
   npm run db:migrate
   ```
   This creates the migration history in `prisma/migrations/` and applies it.
   In production (Vercel), use `npm run db:deploy` instead (applies existing
   migrations without prompting - `migrate dev` is a local/dev-only workflow).
5. **Seed reference data:**
   ```bash
   npm run db:seed
   ```
   Populates States/UTs, Boards (national + state), Class 1-10 for the
   national boards, a starter subject catalog, the achievement catalog, and
   default system settings. See `prisma/seed.ts` and `docs/BOARDS.md`.
   Does **not** seed User/Student/Teacher/Admin accounts - see "What's
   deliberately not seeded" below.
6. **Inspect data visually (optional):**
   ```bash
   npm run db:studio
   ```

## What's seeded (and what isn't)

As of Stage B, `prisma/seed.ts` **does** create the 7 demo `User`/
`Student`/`Teacher`/`Admin` rows, bcrypt-hashed, matching the same
usernames/passwords as the `lib/auth/users.ts` fallback (see
`docs/DEMO_CREDENTIALS.md`) - so login works identically either way, only
the storage mechanism changes once you connect a database.

It only pre-creates Class 1-10 for the 3 **national** boards (CBSE,
CISCE, NIOS), not for all 30+ state boards - that would be a few hundred
speculative rows nobody's using yet. Enabling Class 1-10 for a specific
state board is an Admin > Board & Classes action (Stage C's admin UI,
not yet wired to real data - see `docs/STEP_3_5.md`), not a seed-time
decision.

Not seeded: any `StudyMaterial`, `Worksheet`, `Exam`, or progress data -
those are created through the app itself (Stage C/D/E) once a database
exists, not pre-populated.

## File storage (Stage C)

Uploads (Admin Study Materials, Teacher Worksheets, Teacher Exam Papers)
go through `lib/storage/*` to **Vercel Blob**. Create a Blob store from
your Vercel project's Storage tab and set `BLOB_READ_WRITE_TOKEN` (see
`.env.example`). Without it, `storage.isConfigured` is `false` and every
upload action returns a clear "storage is not configured" error instead
of pretending to succeed - the app still builds and runs fine.

## Known Vercel + Prisma nuances (for when Stage B+ actually queries the DB)

- `package.json` has `"postinstall": "prisma generate"` so the Prisma
  Client is (re)generated automatically on every `npm install` - including
  Vercel's build step. This works correctly **even with no `DATABASE_URL`
  set at all** (verified locally) - `prisma generate` only reads the schema
  file, it doesn't need a live connection. So adding this schema does not
  put the current deployment at risk.
- Vercel's build and runtime environments are the same Linux platform, so
  the default `binaryTargets = ["native"]` (Prisma's default) is sufficient
  - no manual `binaryTargets` override needed.
- The `vector` Postgres extension (for pgvector-based embeddings - see
  `docs/ARCHITECTURE.md`'s weakness-clustering/AI-tutor-memory sections) is
  commented out in `schema.prisma`. Enable it only once you've confirmed
  your Postgres provider actually supports the extension.

## Migration path from mock data

Each `lib/mock-data/*.ts` file maps closely to one or more Prisma models
(see the model-by-model comments in `prisma/schema.prisma`). The plan,
executed one reviewed stage at a time (see `docs/STEP_3_5.md`), is: add a
server-side data-access function backed by Prisma, then swap the page's
mock import for it - one page/feature at a time, so the deployed app never
breaks mid-migration.
