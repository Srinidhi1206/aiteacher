export interface NavItem {
  label: string;
  href: string;
  icon: string; // lucide icon name
  /** Highlight only on this exact path (a parent route that has child routes in the nav). */
  exact?: boolean;
}

export const navItems: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: "LayoutDashboard" },
  { label: "Subjects", href: "/subjects", icon: "BookOpen" },
  { label: "Study Materials", href: "/materials", icon: "Library" },
  { label: "Exams", href: "/exams", icon: "FileEdit" },
  { label: "Results", href: "/results", icon: "Award" },
  { label: "Study Plan", href: "/study-plan", icon: "CalendarClock" },
  { label: "Assignments", href: "/assignments", icon: "ClipboardList" },
  { label: "Practice", href: "/practice-papers", icon: "FileText" },
  { label: "Performance", href: "/performance", icon: "TrendingUp" },
  { label: "Weak Areas", href: "/weak-areas", icon: "Target" },
  { label: "Strengths", href: "/strengths", icon: "Award" },
  { label: "Calendar", href: "/calendar", icon: "Calendar" },
  { label: "Timetable", href: "/timetable", icon: "Clock" },
  { label: "AI Tutor Chat", href: "/ai-tutor", icon: "MessageCircleQuestion" },
  { label: "Settings", href: "/settings", icon: "Settings" },
];

// Each role only ever gets links it is allowed to open - the middleware bounces
// a role away from another role's pages, so showing those links would just
// look broken. Students use the list above; teachers and admins get their own.
const teacherNav: NavItem[] = [
  { label: "Dashboard", href: "/teacher", icon: "LayoutDashboard", exact: true },
  { label: "Exams", href: "/teacher/exams", icon: "FileEdit" },
  { label: "Worksheets", href: "/teacher/worksheets", icon: "ClipboardList" },
];

const adminNav: NavItem[] = [{ label: "Admin Panel", href: "/admin", icon: "ShieldCheck" }];

export function navForRole(role: "student" | "teacher" | "admin" | undefined | null): NavItem[] {
  if (role === "teacher") return teacherNav;
  if (role === "admin") return adminNav;
  return navItems;
}

export function isNavActive(item: NavItem, pathname: string): boolean {
  return pathname === item.href || (!item.exact && pathname.startsWith(item.href + "/"));
}
