// The publicly documented demo passwords (docs/DEMO_CREDENTIALS.md, prisma/seed.ts).
//
// They exist so a fresh DEVELOPMENT database is usable immediately. They must
// never authenticate anyone in production, no matter what a database row says:
// a production deployment could inherit a seeded row by running the seed against
// it, restoring an old backup, or resetting the database. Rather than trust every
// operator to remember that, production login refuses these exact passwords
// (lib/auth/users.ts) and every place that sets a password refuses them too.
//
// Deliberately free of "server-only" and of any Next/Prisma import so the seed and
// the operator scripts (run with tsx, outside Next) can share the same rules.

export const KNOWN_DEFAULT_PASSWORDS = ["Admin@123", "Teacher@123", "Student@123"] as const;

export function isKnownDefaultPassword(password: string): boolean {
  const candidate = password.trim().toLowerCase();
  return KNOWN_DEFAULT_PASSWORDS.some((known) => known.toLowerCase() === candidate);
}

export const PRODUCTION_PASSWORD_MIN_LENGTH = 12;

/** Why a password may not be used for a production account, or null if it is acceptable. */
export function productionPasswordProblem(password: string): string | null {
  if (isKnownDefaultPassword(password)) return "That is one of the publicly documented demo passwords.";
  if (password.length < PRODUCTION_PASSWORD_MIN_LENGTH) return `Use at least ${PRODUCTION_PASSWORD_MIN_LENGTH} characters.`;
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return "Include at least one letter and one number.";
  return null;
}
