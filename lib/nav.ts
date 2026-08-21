export interface NavItem {
  label: string;
  href: string;
  icon: string; // lucide icon name
}

export const navItems: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: "LayoutDashboard" },
  { label: "Subjects", href: "/subjects", icon: "BookOpen" },
  { label: "Study Materials", href: "/materials", icon: "Library" },
  { label: "Exams", href: "/exams", icon: "FileEdit" },
  { label: "Results", href: "/results", icon: "Award" },
  { label: "Study Plan", href: "/study-plan", icon: "CalendarClock" },
  { label: "Assignments", href: "/assignments", icon: "ClipboardList" },
  { label: "Practice Papers", href: "/practice-papers", icon: "FileText" },
  { label: "Performance", href: "/performance", icon: "TrendingUp" },
  { label: "Weak Areas", href: "/weak-areas", icon: "Target" },
  { label: "Achievements", href: "/achievements", icon: "Trophy" },
  { label: "Calendar", href: "/calendar", icon: "Calendar" },
  { label: "AI Tutor Chat", href: "/ai-tutor", icon: "MessageCircleQuestion" },
  { label: "Settings", href: "/settings", icon: "Settings" },
];

// Secondary set of dashboards for other platform roles. Kept separate from
// the primary student nav so the sidebar doesn't feel cluttered - rendered as
// a small "Other Dashboards" section under the main nav.
export const otherDashboards: NavItem[] = [
  { label: "Parent View", href: "/parent", icon: "Users" },
  { label: "Teacher View", href: "/teacher", icon: "GraduationCap" },
  { label: "Admin Panel", href: "/admin", icon: "ShieldCheck" },
];
