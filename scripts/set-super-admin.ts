// Operator tool: create the platform Super Admin, or rotate its password.
//
//   ADMIN_PASSWORD='<a strong secret>' npx tsx --env-file=.env.local scripts/set-super-admin.ts
//   (on a host that already provides DATABASE_URL, drop --env-file)
//
// Use this - not the demo seed - to set up production. It reads the password from the
// ADMIN_PASSWORD environment variable (the same variable prisma/seed.ts uses), never from
// a command-line argument (which would land in shell history and process listings), hashes
// it with bcrypt exactly like the app does, and never prints it.
//
// Optional: SUPER_ADMIN_USERNAME (default "admin"), SUPER_ADMIN_EMAIL, SUPER_ADMIN_NAME.
//
// It is the operator-only counterpart of the seed: no registration or approval flow in the
// app can ever create or promote a super admin, so this needs direct database access.
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { productionPasswordProblem } from "../lib/auth/known-defaults";

// Keep in sync with lib/auth/password.ts (that module is "server-only", so it can't be imported here).
const SALT_ROUNDS = 12;

async function main() {
  const password = process.env.ADMIN_PASSWORD ?? "";
  const username = (process.env.SUPER_ADMIN_USERNAME ?? "admin").trim().toLowerCase();
  const email = (process.env.SUPER_ADMIN_EMAIL ?? `${username}@teachai.local`).trim().toLowerCase();
  const name = (process.env.SUPER_ADMIN_NAME ?? "Super Administrator").trim();

  if (!password) throw new Error("Set the ADMIN_PASSWORD environment variable to the new password.");
  // Always the production rules: running this tool is a deliberate act, and a weak or
  // documented password here would defeat its purpose.
  const problem = productionPasswordProblem(password);
  if (problem) throw new Error(`ADMIN_PASSWORD is not acceptable: ${problem}`);
  if (!/^[a-z0-9._-]{3,30}$/.test(username)) throw new Error("SUPER_ADMIN_USERNAME may only contain lowercase letters, numbers, dots, underscores and hyphens (3-30 characters).");

  const prisma = new PrismaClient();
  try {
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const existing = await prisma.user.findUnique({ where: { username }, include: { admin: true } });

    if (existing) {
      if (existing.role !== "ADMIN" || !existing.admin?.isSuperAdmin) {
        throw new Error(`User "${username}" exists but is not the super admin - refusing to change it.`);
      }
      await prisma.user.update({ where: { id: existing.id }, data: { passwordHash, status: "ACTIVE" } });
      await prisma.auditLog.create({ data: { userId: existing.id, action: "PASSWORD_RESET", resource: `User:${existing.id}`, message: "Super admin password rotated by the operator tool" } });
      console.log(`Super admin "${username}": password updated.`);
      return;
    }

    const created = await prisma.user.create({
      data: { username, email, name, passwordHash, role: "ADMIN", status: "ACTIVE" },
    });
    await prisma.admin.create({ data: { userId: created.id, isSuperAdmin: true } });
    await prisma.auditLog.create({ data: { userId: created.id, action: "USER_CREATE", resource: `User:${created.id}`, message: "Super admin created by the operator tool" } });
    console.log(`Super admin "${username}": created.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  // Print the reason only - never the environment, and never the password.
  console.error(err instanceof Error ? err.message : "Unexpected error.");
  process.exit(1);
});
