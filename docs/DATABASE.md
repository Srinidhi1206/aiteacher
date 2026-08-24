# Database (Stages A-I)

Status: **schema, auth, and every server action through Stage H all exist
and are verified (`prisma validate`, `prisma generate`, `tsc --noEmit`,
`npm run build` all pass) - but no query has ever executed against a live
database.** In development (`NODE_ENV !== "production"`), login falls
back to hardcoded demo accounts when `DATABASE_URL` is unset; every
materials/exam/progress page shows a graceful "database not connected"
state (see `components/database-unavailable.tsx`) instead of pretending
to work. **In production, this fallback is disabled** - see "Production
authentication policy" below. This document describes how to actually
turn the database on - that step hasn't happened yet. See
`docs/STEP_3_5.md` for the full stage-by-stage breakdown of what's built
on top of it.

## Production authentication policy (Stage I)

Two things fail closed in production (`NODE_ENV=production`) rather than
silently degrading:

- **No `SESSION_SECRET`** - `lib/auth/session.ts` throws a configuration
  error the moment a session actually needs to be signed or verified
  (not at server startup - see that file's comments for why). A request
  presenting a session cookie gets a generic 500; `/login` itself still
  renders for a logged-out visitor. **Never** silently signs sessions
  with the checked-into-source-control development secret.
- **No `DATABASE_URL`** - `lib/auth/users.ts`'s `findUser()` throws
  `AuthConfigurationError` instead of falling back to the hardcoded demo
  accounts. `app/api/auth/login/route.ts` catches this specifically and
  returns `503 { error: "Sign-in is temporarily unavailable. Please try
  again later." }` - the real reason is logged server-side only
  (`console.error`), never returned to the client. **Never** authenticates
  a production request against `docs/DEMO_CREDENTIALS.md`'s accounts.

A `DATABASE_URL` that's configured but temporarily unreachable already
behaved correctly before Stage I: `findUserInDatabase` doesn't catch its
own Prisma error, so it propagates as a normal failed request - there was
never a code path where a flaky database silently fell back to demo
accounts.

Both behaviors were verified with a real `next build` + `next start` run
(temporary process-env overrides only, `.env.local` untouched) - see
`docs/STEP_3_5.md`'s Stage I section for the exact commands/results.

## Migration status (Stage I)

**No migration has ever been applied to a real database** - there is no
database to apply it to. What exists as of Stage I:

- `prisma/migrations/migration_lock.toml` (`provider = "postgresql"`) and
  `prisma/migrations/20260824190000_initial_schema/migration.sql` - the
  full initial-schema SQL, generated offline via:
  ```bash
  npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script
  ```
  This command translates the schema straight into SQL using Prisma's
  built-in provider-specific generator - it does **not** need a reachable
  database (confirmed: it ran successfully with `DATABASE_URL`/
  `DIRECT_URL` both unset). Re-running it and diffing the output against
  the committed `migration.sql` produces an identical file, confirming
  the migration corresponds exactly to the current schema.
- What this does **not** verify: that the SQL actually applies cleanly to
  a real Postgres instance, or that Prisma's migration-history bookkeeping
  (the `_prisma_migrations` table) is consistent - both require
  `prisma migrate diff --from-migrations ... --shadow-database-url ...`
  or an actual `prisma migrate deploy` run against a live database, which
  this environment cannot do without real credentials.
- **This migration has not been marked or claimed as applied anywhere.**

### Once you have a real `DATABASE_URL`/`DIRECT_URL`

**First deployment (empty database):**
```bash
npm run db:deploy   # applies prisma/migrations/20260824190000_initial_schema
npm run db:seed     # populates curriculum reference data + demo accounts
```
`db:deploy` runs `prisma migrate deploy` - it applies existing migrations
non-interactively and records them in `_prisma_migrations`, without
prompting or generating a shadow database. This is the correct production
command; never run `prisma migrate dev` or `prisma db push` against a
real/shared database.

**If you'd rather generate the migration fresh instead of trusting the
one committed here** (e.g. you want Prisma's own shadow-database
verification before trusting it), run `npm run db:migrate` once locally
against a real (even temporary/local) database instead - it will detect
the schema already matches `20260824190000_initial_schema` and either
confirm it or prompt to regenerate, rather than silently duplicating it.

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
4. **Apply the migration.** The initial migration already exists at
   `prisma/migrations/20260824190000_initial_schema/` (generated offline -
   see "Migration status" above), so for a first deployment run:
   ```bash
   npm run db:deploy
   ```
   (`prisma migrate deploy` - applies existing migrations without
   prompting; this is also the correct command for Vercel/CI.) Use
   `npm run db:migrate` (`prisma migrate dev`) instead only if you're
   developing locally and need to generate a *new* migration after
   changing `schema.prisma` - it needs a reachable database and a shadow
   database, and is not meant for production/shared databases.
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
