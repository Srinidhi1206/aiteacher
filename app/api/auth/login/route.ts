import { NextRequest, NextResponse } from "next/server";
import { findUser, AuthConfigurationError, type Role } from "@/lib/auth/users";
import { signSession, SESSION_COOKIE, SESSION_MAX_AGE_SECONDS } from "@/lib/auth/session";
import { clientAddress, reserveLoginAttempt, LOGIN_WINDOW_MS } from "@/lib/auth/login-throttle";

const ROLE_HOME: Record<Role, string> = {
  admin: "/admin",
  teacher: "/teacher",
  student: "/dashboard",
};

// Stage F: distinct, non-revealing messages per account status. None of
// these hint at *why* a review went the way it did (see STEP 9 - "do not
// reveal unnecessary internal review information").
const STATUS_MESSAGES: Record<string, string> = {
  PENDING: "Your account is awaiting administrator approval.",
  REJECTED: "Your registration was not approved.",
  SUSPENDED: "Your account has been suspended. Please contact an administrator.",
};

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const role = body?.role as Role | undefined;
  const username = (body?.username || "").trim();
  const password = body?.password || "";

  if (!role || !username || !password) {
    return NextResponse.json({ error: "Missing role, username, or password." }, { status: 400 });
  }

  // Failed sign-ins are limited across all server instances (lib/auth/login-throttle.ts). The attempt RESERVES its place before the password is checked, so simultaneous guesses
  // cannot all pass the limit; the reservation is released unless the password turns out to be wrong. It only applies when there is a database (the development fallback accounts,
  // with no DATABASE_URL, are not limited), and it looks only at what was typed, so it says nothing about whether an account exists.
  const attempt = { address: clientAddress(req.headers), username };
  const throttleDb = process.env.DATABASE_URL ? (await import("@/lib/prisma")).prisma : null;
  const reservation = throttleDb ? await reserveLoginAttempt(throttleDb, attempt) : null;
  if (reservation && !reservation.allowed) {
    return NextResponse.json(
      { error: "Too many sign-in attempts. Please wait about 15 minutes and try again." },
      { status: 429, headers: { "Retry-After": String(Math.ceil(LOGIN_WINDOW_MS / 1000)) } }
    );
  }

  let wrongPassword = false;
  try {
    const result = await signIn(role, username, password);
    wrongPassword = result.wrongPassword;
    return result.response;
  } finally {
    // Only a WRONG password keeps its reservation (it is the failure record). A correct one - including for an account that is still pending or suspended - an unavailable
    // sign-in service, or a crash is not a failed guess.
    if (reservation?.allowed && !wrongPassword) await reservation.release();
  }
}

async function signIn(role: Role, username: string, password: string): Promise<{ response: NextResponse; wrongPassword: boolean }> {
  let outcome;
  try {
    outcome = await findUser(role, username, password);
  } catch (err) {
    if (err instanceof AuthConfigurationError) {
      // Server-side only - the real reason never reaches the client, only
      // a generic "try again later" message. Never becomes "invalid
      // credentials," which would hide a real deployment misconfiguration.
      console.error("[auth] login blocked by configuration error:", err.message);
      return { response: NextResponse.json({ error: "Sign-in is temporarily unavailable. Please try again later." }, { status: 503 }), wrongPassword: false };
    }
    throw err;
  }

  if (outcome.kind === "invalid_credentials") {
    return { response: NextResponse.json({ error: "Invalid username or password for that role." }, { status: 401 }), wrongPassword: true };
  }

  if (outcome.kind === "account_status") {
    return {
      response: NextResponse.json({ error: STATUS_MESSAGES[outcome.status] ?? "Your account cannot sign in right now.", status: outcome.status }, { status: 403 }),
      wrongPassword: false,
    };
  }

  const user = outcome.user;

  const token = await signSession({
    id: user.id,
    name: user.name,
    role: user.role,
    class: user.class,
    assignedClasses: user.assignedClasses,
    subjects: user.subjects,
  });

  const res = NextResponse.json({ ok: true, redirectTo: ROLE_HOME[user.role], name: user.name, role: user.role });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
  return { response: res, wrongPassword: false };
}
