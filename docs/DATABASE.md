# Database (Stage A)

Status: **schema and tooling exist and are verified (`prisma validate`, `prisma generate`,
`tsc --noEmit` all pass); nothing in the app reads or writes through it yet.**
Every page still runs on `lib/mock-data/*`, exactly as before. This document
describes how to actually turn the database on when you're ready - that
step hasn't happened yet.

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

## What's deliberately not seeded yet

`prisma/seed.ts` does not create `User`/`Student`/`Teacher`/`Admin` rows.
Doing that correctly requires password hashing (bcrypt), which is Stage B
(real authentication) - see `docs/STEP_3_5.md`. Until Stage B lands, the 7
demo accounts in `lib/auth/users.ts` keep working exactly as before, fully
independent of the database.

It also only pre-creates Class 1-10 for the 3 **national** boards (CBSE,
CISCE, NIOS), not for all 30+ state boards - that would be a few hundred
speculative rows nobody's using yet. Enabling Class 1-10 for a specific
state board is an Admin > Board & Classes action (Stage C), not a seed-time
decision.

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
