"use client";
import * as React from "react";
import Link from "next/link";
import { GraduationCap, Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";

const links = [
  { label: "Features", href: "#features" },
  { label: "How it Works", href: "#how-it-works" },
  { label: "Demo", href: "#demo" },
  { label: "Pricing", href: "#pricing" },
  { label: "FAQ", href: "#faq" },
];

export function Navbar() {
  const [open, setOpen] = React.useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-gray-100 bg-white/80 backdrop-blur dark:border-gray-800 dark:bg-gray-950/80">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary-600 text-white">
            <GraduationCap className="h-5 w-5" />
          </div>
          <span className="text-lg font-bold tracking-tight text-gray-900 dark:text-gray-50">mAITeacher</span>
        </Link>

        <nav className="hidden items-center gap-8 md:flex">
          {links.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-sm font-medium text-gray-600 transition-colors hover:text-gray-900 dark:text-gray-300 dark:hover:text-white"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="hidden items-center gap-3 md:flex">
          <ThemeToggle />
          <Link href="/onboarding" className="text-sm font-medium text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white">
            Sign in
          </Link>
          <Link href="/onboarding">
            <Button>Get Started</Button>
          </Link>
        </div>

        <button
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-gray-200 text-gray-600 dark:border-gray-700 dark:text-gray-300 md:hidden"
          onClick={() => setOpen(!open)}
          aria-label="Toggle menu"
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {open && (
        <div className="border-t border-gray-100 bg-white px-4 py-4 dark:border-gray-800 dark:bg-gray-950 md:hidden">
          <nav className="flex flex-col gap-3">
            {links.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className="text-sm font-medium text-gray-600 dark:text-gray-300"
              >
                {link.label}
              </a>
            ))}
            <div className="mt-2 flex items-center gap-3">
              <Link href="/onboarding" className="text-sm font-medium text-gray-600 dark:text-gray-300">
                Sign in
              </Link>
              <Link href="/onboarding" className="flex-1">
                <Button className="w-full">Get Started</Button>
              </Link>
              <ThemeToggle />
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
