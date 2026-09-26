// TEMPORARY production diagnostic - removed right after use. Read-only: runs `SELECT 1` and one table
// count. Returns only booleans and Prisma error name/code with URLs and hostnames scrubbed - never a
// secret value and never any row data.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { assertSessionSecretConfigured } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

function scrub(message: string): string {
  return message
    .replace(/postgres(ql)?:\/\/\S+/gi, "<url>")
    .replace(/[a-z0-9-]+(\.[a-z0-9-]+)*\.(neon\.tech|amazonaws\.com|aws\.neon\.tech)/gi, "<host>")
    .replace(/\s+/g, " ")
    .slice(0, 240);
}

function describe(err: unknown) {
  const e = err as { name?: string; code?: string; message?: string; clientVersion?: string };
  return { name: e?.name ?? "Error", code: e?.code ?? null, message: scrub(String(e?.message ?? err)) };
}

export async function GET() {
  const url = process.env.DATABASE_URL ?? "";
  const out: Record<string, unknown> = {
    node: process.version,
    region: process.env.VERCEL_REGION ?? null,
    env: {
      DATABASE_URL: Boolean(url),
      DATABASE_URL_is_pooler: url.includes("-pooler"),
      DATABASE_URL_has_sslmode: url.includes("sslmode="),
      DIRECT_URL: Boolean(process.env.DIRECT_URL),
      SESSION_SECRET: Boolean(process.env.SESSION_SECRET),
      GEMINI_API_KEY: Boolean(process.env.GEMINI_API_KEY),
      BLOB_READ_WRITE_TOKEN: Boolean(process.env.BLOB_READ_WRITE_TOKEN),
    },
  };
  try {
    assertSessionSecretConfigured();
    out.sessionSecret = "ok";
  } catch (err) {
    out.sessionSecret = describe(err).message; // names the rule that failed, never the value
  }
  try {
    await prisma.$queryRaw`SELECT 1`;
    out.select1 = "ok";
  } catch (err) {
    out.select1 = describe(err);
  }
  try {
    out.stateCount = await prisma.state.count();
  } catch (err) {
    out.stateCount = describe(err);
  }
  return NextResponse.json(out, { headers: { "Cache-Control": "no-store" } });
}
