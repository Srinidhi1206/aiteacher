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

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
