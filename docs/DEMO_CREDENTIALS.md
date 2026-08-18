# Demo Login Credentials (development only)

mAITeacher currently ships with 7 hardcoded demo accounts (no real database,
no real auth provider - see [ARCHITECTURE.md](./ARCHITECTURE.md)). They are
defined in [`lib/auth/users.ts`](../lib/auth/users.ts) and can be overridden
per-environment via the env vars in [`.env.example`](../.env.example).

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

## How login works today

1. Visit `/login`.
2. Pick a role (Student / Teacher / Admin) - this is a UI selection only,
   not yet tied to an account lookup.
3. Enter the matching username/password from the table above.
4. `POST /api/auth/login` validates `(role, username, password)` against
   `USERS` in `lib/auth/users.ts` and, on success, sets a signed
   (HMAC-SHA256), httpOnly session cookie (`lib/auth/session.ts`). The
   cookie is **signed, not encrypted** - don't put secrets in the session
   payload.
5. `middleware.ts` reads that cookie on every request, redirects
   unauthenticated users to `/login`, and blocks cross-role access to
   `/admin`, `/teacher`, and the student pages alike (redirecting back to
   the visitor's own dashboard). A returning user with a valid session who
   hits `/login` directly is redirected straight to their dashboard.
6. Logout: `POST /api/auth/logout` clears the cookie.

## Migrating off this demo layer

When you're ready for real auth, replace `lib/auth/users.ts` with a lookup
against the `User` model in `prisma/schema.prisma`, hash passwords with
bcrypt, and swap the hand-rolled HMAC cookie in `lib/auth/session.ts` for
NextAuth/Auth.js (or similar). `middleware.ts` and every page that calls
`verifySession()` should keep working unchanged since they only depend on
the `SessionPayload` shape, not on how it's produced.
