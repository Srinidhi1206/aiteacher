# Demo Login Credentials (development only)

mAITeacher ships with 7 demo accounts (1 admin, 1 teacher, 5 students).
As of Stage B, there are two ways they get authenticated, and the app
switches between them automatically based on whether a database is
connected - see "How login works now" below.

**These are demo credentials only. Change every password (via the env vars
below) before sharing a deployed link with anyone outside your team, and
never commit real production passwords to git.**

| Role    | Username  | Default Password | Name       | Class    |
|---------|-----------|-------------------|------------|----------|
| Admin   | `admin`     | `Admin@123`   | Srinidhi   | -        |
| Teacher | `teacher`   | `Teacher@123` | Teacher    | Classes 8-10, Math/Science |
| Student | `student1`  | `Student@123` | Student 1  | Class 6  |
| Student | `student2`  | `Student@123` | Student 2  | Class 7  |
| Student | `student3`  | `Student@123` | Student 3  | Class 8  |
| Student | `student4`  | `Student@123` | Student 4  | Class 9  |
| Student | `student5`  | `Student@123` | Student 5  | Class 10 |

Same usernames/passwords either way - only *how* they're validated changes.

## How login works now

1. Visit `/login`.
2. Pick a role (Student / Teacher / Admin) - a UI selection only, used to
   narrow the lookup; the session's actual role always comes from the
   matched account record, never trusted from this client input directly
   (see `lib/auth/users.ts`).
3. Enter the matching username/password from the table above.
4. `POST /api/auth/login` calls `findUser(role, username, password)`
   (`lib/auth/users.ts`), which picks one of two paths automatically:
   - **`DATABASE_URL` is set:** looks up the `User` row by `username` in
     Postgres via Prisma, checks `role` and `isActive`, and verifies the
     password against `passwordHash` with bcrypt
     (`lib/auth/password.ts`) - **never plaintext**.
   - **`DATABASE_URL` is unset** (the current state of both local dev and
     the live Vercel deployment - no database is connected yet): falls
     back to a small hardcoded account list with the same credentials,
     exactly as Step 1/2 worked. This is intentional so the app keeps
     working today; it is not a security feature, just a documented
     stopgap that disappears the moment a database is connected.
5. On success, a signed (HMAC-SHA256), httpOnly session cookie is set
   (`lib/auth/session.ts`) - `secure` in production, `sameSite: lax`,
   7-day expiry. The cookie is **signed, not encrypted** - don't put
   secrets in the session payload.
6. `middleware.ts` reads that cookie on every request, redirects
   unauthenticated users to `/login`, and blocks cross-role access to
   `/admin`, `/teacher`, and the student pages alike (redirecting back to
   the visitor's own dashboard). A returning user with a valid session who
   hits `/login` directly is redirected straight to their dashboard.
7. Logout: `POST /api/auth/logout` clears the cookie, invalidating the
   session immediately (any subsequent request has no valid cookie to
   verify).

## Creating real (non-demo) accounts later

Once a database is connected, the 7 demo accounts above are created by
`npm run db:seed` (`prisma/seed.ts`) - bcrypt-hashed there, never
hardcoded in a table an app server reads from. For actual production
users beyond the demo set, accounts are created through the app itself:
self-registration (`/register` - see below) creates a `PENDING` account
that an admin approves via the Admin > Users screen
(`components/admin/users-table.tsx`, backed by
`lib/actions/user-management.ts` and `lib/actions/registration.ts`);
until a database is connected, neither has anything to read/write and
falls back to `DatabaseUnavailable`.

## Status

- **Implemented and locally validated** (without a live database):
  bcrypt hash/verify round-trip, HMAC session sign/verify/tamper-rejection,
  the full login -> session -> middleware -> logout HTTP flow (via the
  fallback path, which exercises the same code paths login/logout/
  middleware always use), `prisma validate`/`generate`, and the seed
  script's logic up to (but not including) an actual database write.
- **Implemented but awaiting a real database connection:** the
  `DATABASE_URL`-backed lookup in `findUserInDatabase()`
  (`lib/auth/users.ts`) and running `npm run db:seed` for real. Both are
  written and type-checked against the generated Prisma client, but have
  not executed against a live Postgres instance - see `docs/DATABASE.md`.
- **Not implemented:** NextAuth/OAuth/third-party auth providers. Admin
  user management and account self-registration/approval are implemented
  (Stages C-F, hardened through Stage M) - see `docs/STEP_3_5.md`.
