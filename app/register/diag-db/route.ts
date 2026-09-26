// TEMPORARY production diagnostic - removed right after use. Read-only: runs `SELECT 1` and one table
// count. Returns only booleans and Prisma error name/code with URLs and hostnames scrubbed - never a
// secret value and never any row data.
import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import dns from "node:dns/promises";
import net from "node:net";
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

  // Reachability of the configured host, without revealing it: only a short fingerprint is returned.
  try {
    const u = new URL(url);
    out.hostFingerprint = createHash("sha256").update(u.hostname).digest("hex").slice(0, 10);
    out.port = u.port || "5432";
    out.dbNameFingerprint = createHash("sha256").update(u.pathname).digest("hex").slice(0, 6);
    try {
      const addrs = await dns.lookup(u.hostname, { all: true });
      out.dns = { ok: true, addresses: addrs.length };
    } catch (err) {
      out.dns = { ok: false, code: (err as { code?: string }).code ?? "error" };
    }
    out.tcp = await new Promise((resolve) => {
      const t0 = Date.now();
      const sock = net.connect({ host: u.hostname, port: Number(u.port || 5432), timeout: 4000 });
      sock.once("connect", () => { sock.destroy(); resolve({ ok: true, ms: Date.now() - t0 }); });
      sock.once("timeout", () => { sock.destroy(); resolve({ ok: false, reason: "timeout" }); });
      sock.once("error", (e: NodeJS.ErrnoException) => { resolve({ ok: false, reason: e.code ?? "error", ms: Date.now() - t0 }); });
    });
  } catch {
    out.hostFingerprint = "unparseable DATABASE_URL";
  }
  return NextResponse.json(out, { headers: { "Cache-Control": "no-store" } });
}
