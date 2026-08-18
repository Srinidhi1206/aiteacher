"use client";
import { Bell, Flame, Star } from "lucide-react";
import { MobileNav } from "@/components/layout/mobile-nav";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { notifications as mockNotifications } from "@/lib/mock-data/notifications";
import { currentStudent } from "@/lib/mock-data/students";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const typeColor: Record<string, string> = {
  reminder: "bg-primary-100 text-primary-700 dark:bg-primary-950 dark:text-primary-300",
  achievement: "bg-success-100 text-success-700 dark:bg-success-900/40 dark:text-success-400",
  grade: "bg-primary-100 text-primary-700 dark:bg-primary-950 dark:text-primary-300",
  streak: "bg-warning-100 text-warning-700 dark:bg-warning-900/40 dark:text-warning-400",
  system: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  exam: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400",
};

export function Topbar({ title }: { title: string }) {
  const unreadCount = mockNotifications.filter((n) => !n.read).length;

  return (
    <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-gray-100 bg-white/80 px-4 py-4 backdrop-blur dark:border-gray-800 dark:bg-gray-900/80 sm:px-6">
      <div className="flex items-center gap-3">
        <MobileNav />
        <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-50 sm:text-xl">{title}</h1>
      </div>

      <div className="flex items-center gap-2 sm:gap-3">
        <div className="hidden items-center gap-1.5 rounded-xl bg-warning-50 px-3 py-1.5 text-warning-700 dark:bg-warning-900/20 dark:text-warning-400 sm:flex">
          <Flame className="h-4 w-4" />
          <span className="text-sm font-semibold">{currentStudent.streakDays}</span>
        </div>

        <div className="hidden items-center gap-1.5 rounded-xl bg-primary-50 px-3 py-1.5 text-primary-700 dark:bg-primary-950 dark:text-primary-300 sm:flex">
          <Star className="h-4 w-4" />
          <span className="text-sm font-semibold">Lvl {currentStudent.level}</span>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger>
            <div className="relative flex h-9 w-9 items-center justify-center rounded-xl border border-gray-200 text-gray-500 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800">
              <Bell className="h-4 w-4" />
              {unreadCount > 0 && (
                <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
                  {unreadCount}
                </span>
              )}
            </div>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="max-h-96 w-80 overflow-y-auto">
            <DropdownMenuLabel>Notifications</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {mockNotifications.map((n) => (
              <DropdownMenuItem key={n.id} className="items-start">
                <span className={cn("mt-0.5 h-2 w-2 shrink-0 rounded-full", n.read ? "bg-transparent" : "bg-primary-500")} />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-50">{n.title}</p>
                    <Badge className={cn("text-[10px]", typeColor[n.type])}>{n.type}</Badge>
                  </div>
                  <p className="mt-0.5 line-clamp-2 text-xs text-gray-500 dark:text-gray-400">{n.message}</p>
                  <p className="mt-1 text-[11px] text-gray-400">{n.time}</p>
                </div>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <ThemeToggle />
      </div>
    </header>
  );
}
