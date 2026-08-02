"use client";
import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { GraduationCap, Menu, X, Flame } from "lucide-react";
import { navItems, otherDashboards } from "@/lib/nav";
import { DynamicIcon } from "@/lib/icon-map";
import { currentStudent } from "@/lib/mock-data/students";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

export function MobileNav() {
  const [open, setOpen] = React.useState(false);
  const pathname = usePathname();

  React.useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <>
      <button
        type="button"
        aria-label="Open menu"
        onClick={() => setOpen(true)}
        className="flex h-9 w-9 items-center justify-center rounded-xl border border-gray-200 text-gray-600 dark:border-gray-700 dark:text-gray-300 lg:hidden"
      >
        <Menu className="h-5 w-5" />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-gray-900/50" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 flex w-72 flex-col bg-white shadow-card dark:bg-gray-900">
            <div className="flex items-center justify-between px-5 py-5">
              <div className="flex items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary-600 text-white">
                  <GraduationCap className="h-5 w-5" />
                </div>
                <span className="text-lg font-bold text-gray-900 dark:text-gray-50">mAITeacher</span>
              </div>
              <button
                aria-label="Close menu"
                onClick={() => setOpen(false)}
                className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-2">
              {navItems.map((item) => {
                const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium",
                      isActive
                        ? "bg-primary-50 text-primary-700 dark:bg-primary-950 dark:text-primary-300"
                        : "text-gray-600 dark:text-gray-400"
                    )}
                  >
                    <DynamicIcon name={item.icon} className="h-[18px] w-[18px]" />
                    {item.label}
                  </Link>
                );
              })}

              <div className="mt-4 border-t border-gray-100 pt-4 dark:border-gray-800">
                <p className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                  Other Dashboards
                </p>
                {otherDashboards.map((item) => {
                  const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={cn(
                        "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium",
                        isActive
                          ? "bg-primary-50 text-primary-700 dark:bg-primary-950 dark:text-primary-300"
                          : "text-gray-600 dark:text-gray-400"
                      )}
                    >
                      <DynamicIcon name={item.icon} className="h-[18px] w-[18px]" />
                      {item.label}
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
                <Avatar initials={currentStudent.avatarInitials} colorClassName={currentStudent.avatarColor} />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-gray-900 dark:text-gray-50">{currentStudent.name}</p>
                  <p className="truncate text-xs text-gray-500 dark:text-gray-400">{currentStudent.grade}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
