// Prisma Client singleton, following Prisma's own recommended Next.js
// pattern: cache the client on `globalThis` in development so Next's hot
// reload doesn't spawn a new database connection pool on every file save.
// See https://pris.ly/d/help/next-js-best-practices
//
// Not imported anywhere yet (Stage A) - lib/mock-data/* remains the source
// of truth for the UI until later stages progressively switch pages over.
// Importing this file without a real DATABASE_URL configured will not throw
// at import time; it only fails when a query actually runs.
//
// The "server-only" import below is a build-time guard, not just a
// convention: if this module (or anything that imports it) ever ends up
// pulled into a Client Component bundle, Next.js fails the build with an
// explicit error instead of silently shipping @prisma/client's Node-only
// code (and, if it ever went further, the database connection string) to
// the browser. Server Components, Route Handlers, and Server Actions are
// all fine - only "use client" files are blocked from importing this.
import "server-only";

import { PrismaClient } from "@prisma/client";

// `omit` below is a client-wide default: User.passwordHash is NEVER selected
// unless a query explicitly opts back in with `omit: { passwordHash: false }`.
// The only code that needs the hash is the login password check
// (lib/auth/users.ts) - every other query, include, or relation that yields
// a User row (Users list, registration requests, exam submissions, material
// uploaders, anything added later) is protected by default, so a bcrypt hash
// can't reach a browser through a forgotten `include: { user: true }`.
// Connection behaviour for a serverless Postgres (Neon) behind its PgBouncer pooler. The
// failures seen in practice were all the same few things, each with a specific cause:
//   - P1001 "Can't reach database server": a suspended compute needs several seconds to wake,
//     but Prisma gives up after 5s by default  -> connect_timeout=15
//   - P1017 / ConnectionReset on the first query after a quiet spell: the pool reused a
//     connection the server had already closed  -> retire idle connections after 60s
//     (max_idle_connection_lifetime) so an old one is never handed out
//   - P2024 "timed out fetching a connection" under a burst of parallel queries -> pool_timeout=20
//   - a query that never answers holding a request open forever -> socket_timeout=90
//   - pgbouncer=true tells Prisma the pooler is in transaction mode (no session-level
//     prepared statements) - only added for a "-pooler" host.
// Nothing is overridden: any of these already present in DATABASE_URL wins, and the URL
// itself (with its credentials) is never logged.
function tunedDatabaseUrl(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  try {
    const url = new URL(raw);
    if (!/^postgres(ql)?:$/.test(url.protocol)) return raw;
    const defaults: Record<string, string> = {
      connect_timeout: "15",
      pool_timeout: "20",
      socket_timeout: "90",
      max_idle_connection_lifetime: "60",
    };
    if (url.hostname.includes("-pooler")) defaults.pgbouncer = "true";
    for (const [key, value] of Object.entries(defaults)) {
      if (!url.searchParams.has(key)) url.searchParams.set(key, value);
    }
    return url.toString();
  } catch {
    return raw;
  }
}

function createClient() {
  const url = tunedDatabaseUrl(process.env.DATABASE_URL);
  return new PrismaClient({
    ...(url ? { datasources: { db: { url } } } : {}),
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
    omit: { user: { passwordHash: true } },
  });
}

const globalForPrisma = globalThis as unknown as { prisma?: ReturnType<typeof createClient> };

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
