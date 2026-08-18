"use client";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { GraduationCap, Flame, LogOut } from "lucide-react";
import { navItems, otherDashboards } from "@/lib/nav";
import { DynamicIcon } from "@/lib/icon-map";
import { currentStudent } from "@/lib/mock-data/students";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import type { SessionPayload } from "@/lib/auth/session";

export function Sidebar({ className, user }: { className?: string; user?: SessionPayload | null }) {
  const pathname = usePathname();
  const router = useRouter();

  // Only show "Other Dashboards" links the current role is allowed into.
  const visibleOtherDashboards = otherDashboards.filter((item) => {
    if (!user) return true;
    if (item.href === "/admin") return user.role === "admin";
    if (item.href === "/teacher") return user.role === "teacher";
    return true; // /parent has no restriction yet
  });

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <aside
      className={cn(
        "flex h-full w-64 shrink-0 flex-col border-r border-gray-100 bg-white dark:border-gray-800 dark:bg-gray-900",
        className
      )}
    >
      <div className="flex items-center gap-2 px-6 py-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary-600 text-white">
          <GraduationCap className="h-5 w-5" />
        </div>
        <span className="text-lg font-bold tracking-tight text-gray-900 dark:text-gray-50">
          mAITeacher
        </span>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-2 scrollbar-none">
        {navItems.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary-50 text-primary-700 dark:bg-primary-950 dark:text-primary-300"
                  : "text-gray-600 hover:bg-gray-50 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100"
              )}
            >
              <DynamicIcon
                name={item.icon}
                className={cn("h-[18px] w-[18px] shrink-0", isActive ? "text-primary-600 dark:text-primary-400" : "text-gray-400")}
              />
              <span className="truncate">{item.label}</span>
            </Link>
          );
        })}

        <div className="mt-4 border-t border-gray-100 pt-4 dark:border-gray-800">
          <p className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
            Other Dashboards
          </p>
          {visibleOtherDashboards.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-primary-50 text-primary-700 dark:bg-primary-950 dark:text-primary-300"
                    : "text-gray-600 hover:bg-gray-50 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100"
                )}
              >
                <DynamicIcon
                  name={item.icon}
                  className={cn("h-[18px] w-[18px] shrink-0", isActive ? "text-primary-600 dark:text-primary-400" : "text-gray-400")}
                />
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>

      <div className="border-t border-gray-100 p-4 dark:border-gray-800">
        <div className="mb-3 flex items-center gap-2 rounded-xl bg-warning-50 px-3 py-2 text-warning-700 dark:bg-warning-900/20 dark:text-warning-400">
          <Flame className="h-4 w-4" />
          <span className="text-xs font-semibold">{currentStudent.streakDays}-day streak</span>
        </div>
        <div className="flex items-center gap-3">
          <Avatar
            initials={user ? user.name.slice(0, 2).toUpperCase() : currentStudent.avatarInitials}
            colorClassName={currentStudent.avatarColor}
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-gray-900 dark:text-gray-50">
              {user ? user.name : currentStudent.name}
            </p>
            <p className="truncate text-xs capitalize text-gray-500 dark:text-gray-400">
              {user ? user.role : `${currentStudent.grade} - ${currentStudent.curriculum}`}
            </p>
          </div>
          <button
            onClick={handleLogout}
            title="Log out"
            className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800 dark:hover:text-gray-200"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
