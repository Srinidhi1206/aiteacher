import { NextRequest, NextResponse } from "next/server";
import { verifySession, SESSION_COOKIE } from "@/lib/auth/session";
import type { Role } from "@/lib/auth/users";

// Student-facing pages don't share a single "/student" prefix (they're
// top-level routes like /dashboard, /subjects, etc.) - list them explicitly
// so teacher/admin sessions are blocked the same way students are blocked
// from /teacher and /admin. /parent is intentionally left open since it
// isn't one of the three core roles yet.
const STUDENT_PATHS = [
  "/dashboard",
  "/subjects",
  "/study-plan",
  "/assignments",
  "/practice-papers",
  "/performance",
  "/weak-areas",
  "/achievements",
  "/calendar",
  "/ai-tutor",
  "/settings",
];

// Routes that require a specific role. Anything under (app) not listed here
// just requires "logged in" (any role).
const ROLE_ONLY: { prefix: string; role: Role }[] = [
  { prefix: "/admin", role: "admin" },
  { prefix: "/teacher", role: "teacher" },
  ...STUDENT_PATHS.map((prefix) => ({ prefix, role: "student" as Role })),
];

const ROLE_HOME: Record<Role, string> = {
  admin: "/admin",
  teacher: "/teacher",
  student: "/dashboard",
};

// Everything that should NOT be gated by login.
const PUBLIC_PATHS = ["/login", "/api/auth/login", "/api/auth/logout"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const isPublic =
    PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/")) ||
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico";

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const session = await verifySession(token);

  // Returning user: skip the role-selection/login screen entirely and land
  // straight on their dashboard instead of re-prompting "who are you?".
  if (pathname === "/login" && session) {
    return NextResponse.redirect(new URL(ROLE_HOME[session.role], req.url));
  }

  // Marketing landing page ("/") and onboarding stay public too.
  if (pathname === "/" || pathname.startsWith("/onboarding") || isPublic) {
    return NextResponse.next();
  }

  if (!session) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  const restricted = ROLE_ONLY.find((r) => pathname === r.prefix || pathname.startsWith(r.prefix + "/"));
  if (restricted && session.role !== restricted.role) {
    return NextResponse.redirect(new URL(ROLE_HOME[session.role], req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
