// TEMPORARY production diagnostic - removed right after use. STRICTLY READ-ONLY: it opens TCP/TLS
// connections, performs the Postgres startup + SCRAM login and runs `SELECT 1`. It never writes, never
// returns a credential, URL, hostname, IP address or row data - only stage names, timings, protocol
// facts and scrubbed error text. Gated by a one-time key (only its SHA-256 is in the source).
import { NextResponse } from "next/server";
import net from "node:net";
import tls from "node:tls";
import dns from "node:dns/promises";
import fs from "node:fs";
import path from "node:path";
import { createHash, createHmac, pbkdf2Sync, randomBytes } from "node:crypto";
import { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const maxDuration = 45;

const GATE_SHA256 = "d36ad23dc22a32210544ce51119e3bdfb8fe3ea2ef0041d70195e9d36e2f226c";

type Json = Record<string, unknown>;
type Msg = { type: string; body: Buffer };

function scrubber(secrets: string[]) {
  return (text: string) => {
    let out = String(text);
    for (const s of secrets) if (s && s.length >= 3) out = out.split(s).join("<redacted>");
    return out
      .replace(/postgres(ql)?:\/\/\S+/gi, "<url>")
      .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, "<ip>")
      .replace(/[a-z0-9-]+(\.[a-z0-9-]+)*\.(neon\.tech|amazonaws\.com)/gi, "<host>")
      .replace(/\s+/g, " ")
      .slice(0, 260);
  };
}

function makeReader(sock: net.Socket) {
  let buf = Buffer.alloc(0);
  let ended: Error | null = null;
  let wake: (() => void) | null = null;
  sock.on("data", (d: Buffer) => {
    buf = Buffer.concat([buf, d]);
    wake?.();
  });
  sock.on("error", (e: Error) => {
    ended = e;
    wake?.();
  });
  sock.on("close", () => {
    ended = ended ?? new Error("connection closed by server");
    wake?.();
  });
  return async function next(ms: number): Promise<Msg> {
    const deadline = Date.now() + ms;
    for (;;) {
      if (buf.length >= 5) {
        const len = buf.readInt32BE(1);
        if (buf.length >= 1 + len) {
          const m = { type: String.fromCharCode(buf[0]), body: buf.subarray(5, 1 + len) };
          buf = buf.subarray(1 + len);
          return m;
        }
      }
      if (ended) throw ended;
      const left = deadline - Date.now();
      if (left <= 0) throw new Error("timeout waiting for server");
      await new Promise<void>((res) => {
        const t = setTimeout(res, left);
        wake = () => {
          clearTimeout(t);
          res();
        };
      });
      wake = null;
    }
  };
}

const i32 = (n: number) => {
  const b = Buffer.alloc(4);
  b.writeInt32BE(n);
  return b;
};
const frame = (type: string, body: Buffer) => Buffer.concat([Buffer.from(type), i32(body.length + 4), body]);
const cstr = (s: string) => Buffer.concat([Buffer.from(s, "utf8"), Buffer.from([0])]);
const hmac = (key: Buffer, data: string | Buffer) => createHmac("sha256", key).update(data).digest();

function pgError(body: Buffer, scrub: (t: string) => string) {
  const f: Record<string, string> = {};
  let i = 0;
  while (i < body.length && body[i] !== 0) {
    const code = String.fromCharCode(body[i]);
    const end = body.indexOf(0, i + 1);
    f[code] = body.subarray(i + 1, end).toString("utf8");
    i = end + 1;
  }
  return { severity: f.S, sqlstate: f.C, message: scrub(f.M ?? "") };
}

async function probeTarget(label: string, host: string, port: number, user: string, db: string, password: string): Promise<Json> {
  const scrub = scrubber([user, password, host, db]);
  const r: Json = { label };
  const t0 = Date.now();
  let stage = "dns";
  let raw: net.Socket | null = null;
  let secure: tls.TLSSocket | null = null;
  try {
    const addrs = await dns.lookup(host, { all: true, verbatim: true });
    r.dns = { orderedFamilies: addrs.map((a) => a.family), v4: addrs.filter((a) => a.family === 4).length, v6: addrs.filter((a) => a.family === 6).length };
    const target = addrs.find((a) => a.family === 4) ?? addrs[0];

    stage = "tcp";
    const tc = Date.now();
    raw = net.connect({ host: target.address, port, timeout: 6000 });
    await new Promise<void>((res, rej) => {
      raw!.once("connect", () => res());
      raw!.once("timeout", () => rej(Object.assign(new Error("tcp connect timeout"), { code: "ETIMEDOUT" })));
      raw!.once("error", rej);
    });
    r.tcp = { ok: true, ms: Date.now() - tc, family: target.family };

    stage = "sslrequest";
    const first = await new Promise<Buffer>((res, rej) => {
      raw!.once("data", res);
      raw!.once("error", rej);
      raw!.once("close", () => rej(new Error("closed before SSLRequest reply")));
      raw!.write(Buffer.concat([i32(8), i32(80877103)]));
    });
    r.sslRequestReply = String.fromCharCode(first[0]);
    if (first[0] !== 0x53) throw new Error("server did not agree to TLS");

    stage = "tls";
    const ts = Date.now();
    secure = tls.connect({ socket: raw, servername: host, rejectUnauthorized: false });
    await new Promise<void>((res, rej) => {
      secure!.once("secureConnect", () => res());
      secure!.once("error", rej);
    });
    const cert = secure.getPeerCertificate(false);
    r.tls = {
      ok: true,
      ms: Date.now() - ts,
      protocol: secure.getProtocol(),
      cipher: secure.getCipher()?.name,
      certTrustedByThisRuntime: secure.authorized,
      trustError: secure.authorizationError ? String(secure.authorizationError) : null,
      issuerOrg: cert?.issuer?.O ?? null,
      subjectCN: cert?.subject?.CN ? "<host>" : null,
      validTo: cert?.valid_to ?? null,
    };

    const next = makeReader(secure);
    stage = "startup";
    const params = Buffer.concat([cstr("user"), cstr(user), cstr("database"), cstr(db), cstr("client_encoding"), cstr("UTF8"), Buffer.from([0])]);
    const startup = Buffer.concat([i32(8 + params.length), i32(196608), params]);
    secure.write(startup);
    const m1 = await next(10000);
    r.startupReply = m1.type;
    if (m1.type === "E") throw Object.assign(new Error("server error at startup"), { pg: pgError(m1.body, scrub) });
    if (m1.type !== "R") throw new Error(`unexpected startup reply '${m1.type}'`);
    const authCode = m1.body.readInt32BE(0);
    r.authRequestCode = authCode;
    if (authCode !== 10) throw new Error(`unexpected authentication request ${authCode}`);
    r.saslMechanisms = m1.body.subarray(4).toString("utf8").split("\0").filter(Boolean);

    stage = "scram";
    const sa = Date.now();
    const nonce = randomBytes(18).toString("base64");
    const bare = `n=,r=${nonce}`;
    const firstMsg = Buffer.from(`n,,${bare}`);
    secure.write(frame("p", Buffer.concat([cstr("SCRAM-SHA-256"), i32(firstMsg.length), firstMsg])));
    const m2 = await next(10000);
    if (m2.type === "E") throw Object.assign(new Error("server error during SCRAM"), { pg: pgError(m2.body, scrub) });
    if (m2.type !== "R" || m2.body.readInt32BE(0) !== 11) throw new Error("unexpected SCRAM challenge");
    const serverFirst = m2.body.subarray(4).toString("utf8");
    const kv = Object.fromEntries(serverFirst.split(",").map((p) => [p[0], p.slice(2)]));
    if (!kv.r?.startsWith(nonce)) throw new Error("SCRAM nonce mismatch");
    const salted = pbkdf2Sync(Buffer.from(password, "utf8"), Buffer.from(kv.s, "base64"), Number(kv.i), 32, "sha256");
    const clientKey = hmac(salted, "Client Key");
    const storedKey = createHash("sha256").update(clientKey).digest();
    const finalNoProof = `c=biws,r=${kv.r}`;
    const authMessage = `${bare},${serverFirst},${finalNoProof}`;
    const sig = hmac(storedKey, authMessage);
    const proof = Buffer.from(clientKey.map((b, idx) => b ^ sig[idx])).toString("base64");
    secure.write(frame("p", Buffer.from(`${finalNoProof},p=${proof}`)));
    const m3 = await next(10000);
    if (m3.type === "E") throw Object.assign(new Error("server rejected credentials"), { pg: pgError(m3.body, scrub) });
    if (m3.type !== "R" || m3.body.readInt32BE(0) !== 12) throw new Error("unexpected SCRAM final");
    const serverKey = hmac(salted, "Server Key");
    const expected = hmac(serverKey, authMessage).toString("base64");
    const serverSigOk = m3.body.subarray(4).toString("utf8") === `v=${expected}`;
    let m4 = await next(10000);
    if (m4.type === "E") throw Object.assign(new Error("server error after SCRAM"), { pg: pgError(m4.body, scrub) });
    if (!(m4.type === "R" && m4.body.readInt32BE(0) === 0)) throw new Error("authentication not confirmed");
    r.auth = { ok: true, ms: Date.now() - sa, serverSignatureVerified: serverSigOk };

    stage = "query";
    while (m4.type !== "Z") m4 = await next(10000); // drain ParameterStatus / BackendKeyData until ReadyForQuery
    const qs = Date.now();
    secure.write(frame("Q", cstr("SELECT 1")));
    let rows = 0;
    for (;;) {
      const m = await next(15000);
      if (m.type === "D") rows++;
      if (m.type === "E") throw Object.assign(new Error("server error on query"), { pg: pgError(m.body, scrub) });
      if (m.type === "Z") break;
    }
    r.query = { ok: true, rows, ms: Date.now() - qs };
    secure.write(frame("X", Buffer.alloc(0)));
    r.result = "FULL SUCCESS: TCP + TLS + Postgres auth + SELECT 1";
  } catch (e) {
    const err = e as Error & { code?: string; pg?: unknown };
    r.result = "FAILED";
    r.failedAt = stage;
    r.error = { name: err.name, code: err.code ?? null, message: scrub(err.message), postgres: err.pg ?? null };
  } finally {
    secure?.destroy();
    raw?.destroy();
    r.totalMs = Date.now() - t0;
  }
  return r;
}

async function prismaAttempt(label: string, url: string | null): Promise<Json> {
  const t0 = Date.now();
  const scrub = scrubber([]);
  const client = url ? new PrismaClient({ datasourceUrl: url, log: [] }) : prisma;
  try {
    await client.$queryRaw`SELECT 1`;
    return { label, ok: true, ms: Date.now() - t0 };
  } catch (e) {
    const err = e as Error & { errorCode?: string; code?: string };
    return { label, ok: false, ms: Date.now() - t0, name: err.name, prismaCode: err.errorCode ?? err.code ?? null, message: scrub(err.message) };
  } finally {
    if (url) await (client as PrismaClient).$disconnect().catch(() => {});
  }
}

function runtimeFacts(): Json {
  const dirs = [path.join(process.cwd(), "node_modules/.prisma/client"), path.join(process.cwd(), ".prisma/client")];
  const engines: Record<string, string[]> = {};
  for (const d of dirs) {
    try {
      engines[d.replace(process.cwd(), ".")] = fs.readdirSync(d).filter((f) => /query_engine|libquery|schema\.prisma/i.test(f));
    } catch {
      /* directory not present */
    }
  }
  return {
    node: process.version,
    opensslInNode: process.versions.openssl,
    platform: process.platform,
    arch: process.arch,
    vercelRegion: process.env.VERCEL_REGION ?? null,
    lambdaEnv: process.env.AWS_EXECUTION_ENV ?? null,
    prismaClientVersion: Prisma.prismaVersion?.client ?? null,
    prismaEngineFilesFound: engines,
    explicitEngineOverride: Boolean(process.env.PRISMA_QUERY_ENGINE_LIBRARY || process.env.PRISMA_QUERY_ENGINE_BINARY),
  };
}

export async function GET(req: Request) {
  const key = new URL(req.url).searchParams.get("k") ?? "";
  if (createHash("sha256").update(key).digest("hex") !== GATE_SHA256) return new NextResponse("Not found", { status: 404 });

  const out: Json = { runtime: runtimeFacts() };
  const raw = process.env.DATABASE_URL ?? "";
  let u: URL | null = null;
  try {
    u = new URL(raw);
  } catch {
    out.databaseUrl = "missing or unparseable";
  }
  if (u) {
    const user = decodeURIComponent(u.username);
    const password = decodeURIComponent(u.password);
    const db = decodeURIComponent(u.pathname.slice(1));
    const port = Number(u.port || 5432);
    out.databaseUrlShape = {
      pooledHost: u.hostname.includes("-pooler"),
      port,
      hasDbName: Boolean(db),
      hasUser: Boolean(user),
      passwordLength: password.length,
      passwordHasSpecialChars: /[^A-Za-z0-9_-]/.test(password),
      queryParamNames: [...u.searchParams.keys()],
      hasWhitespaceOrQuotes: /[\s"']/.test(raw),
      protocol: u.protocol,
    };
    // Raw protocol probes: pooled host exactly as configured, then the direct (non-pooler) host with the same login.
    out.rawPooled = await probeTarget("pooled host as configured", u.hostname, port, user, db, password);
    if (u.hostname.includes("-pooler")) {
      out.rawDirect = await probeTarget("direct host (same login)", u.hostname.replace("-pooler", ""), port, user, db, password);
    }
    // Prisma engine attempts, for comparison with the raw protocol results.
    const variant = (mut: (x: URL) => void) => {
      const x = new URL(raw);
      mut(x);
      return x.toString();
    };
    out.prisma = [
      await prismaAttempt("app client (lib/prisma.ts, as deployed)", null),
      await prismaAttempt("prisma sslmode=require", variant((x) => x.searchParams.set("sslmode", "require"))),
      await prismaAttempt("prisma sslmode=require + sslaccept=accept_invalid_certs", variant((x) => { x.searchParams.set("sslmode", "require"); x.searchParams.set("sslaccept", "accept_invalid_certs"); })),
    ];
  }
  return NextResponse.json(out, { headers: { "Cache-Control": "no-store" } });
}
