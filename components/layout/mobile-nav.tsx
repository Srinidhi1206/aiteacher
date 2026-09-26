"use client";
import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { GraduationCap, LogOut, Menu, X } from "lucide-react";
import { navForRole, isNavActive } from "@/lib/nav";
import { DynamicIcon } from "@/lib/icon-map";
import { useSessionUser } from "@/components/layout/session-user-context";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

export function MobileNav() {
  const user = useSessionUser();
  const [open, setOpen] = React.useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const items = navForRole(user?.role);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

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
              {items.map((item) => {
                const isActive = isNavActive(item, pathname);
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

            </nav>

            <div className="border-t border-gray-100 p-4 dark:border-gray-800">
              <div className="flex items-center gap-3">
                <Avatar initials={user ? user.name.slice(0, 2).toUpperCase() : "?"} colorClassName="bg-primary-500" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-gray-900 dark:text-gray-50">{user?.name ?? ""}</p>
                  <p className="truncate text-xs capitalize text-gray-500 dark:text-gray-400">{user?.role ?? ""}</p>
                </div>
                <button
                  type="button"
                  onClick={handleLogout}
                  aria-label="Log out"
                  title="Log out"
                  className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800 dark:hover:text-gray-200"
                >
                  <LogOut className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
