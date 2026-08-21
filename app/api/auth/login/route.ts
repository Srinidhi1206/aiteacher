import { NextRequest, NextResponse } from "next/server";
import { findUser, type Role } from "@/lib/auth/users";
import { signSession, SESSION_COOKIE } from "@/lib/auth/session";

const ROLE_HOME: Record<Role, string> = {
  admin: "/admin",
  teacher: "/teacher",
  student: "/dashboard",
};

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const role = body?.role as Role | undefined;
  const username = (body?.username || "").trim();
  const password = body?.password || "";

  if (!role || !username || !password) {
    return NextResponse.json({ error: "Missing role, username, or password." }, { status: 400 });
  }

  const user = await findUser(role, username, password);
  if (!user) {
    return NextResponse.json({ error: "Invalid username or password for that role." }, { status: 401 });
  }

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
    maxAge: 60 * 60 * 24 * 7, // 7 days
  });
  return res;
}
