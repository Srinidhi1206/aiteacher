"use client";
import { MobileNav } from "@/components/layout/mobile-nav";
import { ThemeToggle } from "@/components/theme-toggle";

export function Topbar({ title }: { title: string }) {
  return (
    <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-gray-100 bg-white/80 px-4 py-4 backdrop-blur dark:border-gray-800 dark:bg-gray-900/80 sm:px-6">
      <div className="flex items-center gap-3">
        <MobileNav />
        <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-50 sm:text-xl">{title}</h1>
      </div>

      <div className="flex items-center gap-2 sm:gap-3">
        <ThemeToggle />
      </div>
    </header>
  );
}
