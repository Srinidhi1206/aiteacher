"use client";
// The student's notification bell: an unread count and a short list of what is new (a published material, assignment,
// exam, a graded exam). Shown to students only - they are the audience the app notifies. Backed by
// lib/actions/notifications.ts; opening the list marks it read.
import * as React from "react";
import Link from "next/link";
import { Bell, FileText, ClipboardList, FileEdit, Award, Info } from "lucide-react";
import { cn, formatDate } from "@/lib/utils";
import { getMyNotifications, markMyNotificationsRead, type MyNotification } from "@/lib/actions/notifications";
import { useSessionUser } from "@/components/layout/session-user-context";

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = { MATERIAL: FileText, ASSIGNMENT: ClipboardList, EXAM: FileEdit, GRADE: Award };
const LINKS: Record<string, string> = { MATERIAL: "/materials", ASSIGNMENT: "/assignments", EXAM: "/exams", GRADE: "/results" };

export function NotificationBell() {
  const user = useSessionUser();
  const [data, setData] = React.useState<{ unread: number; items: MyNotification[] } | null>(null);
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  const isStudent = user?.role === "student";

  const load = React.useCallback(() => {
    getMyNotifications()
      .then(setData)
      .catch(() => {});
  }, []);

  React.useEffect(() => {
    if (!isStudent) return;
    load();
    const t = setInterval(load, 120_000); // quietly pick up new items while the page is open
    return () => clearInterval(t);
  }, [isStudent, load]);

  React.useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!isStudent) return null;
  const unread = data?.unread ?? 0;

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next) {
      load();
      if (unread > 0) {
        await markMyNotificationsRead().catch(() => {});
        // keep the unread dots visible for this opening, but clear the badge
        setData((d) => (d ? { ...d, unread: 0 } : d));
      }
    }
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
        aria-expanded={open}
        onClick={toggle}
        className="relative flex h-9 w-9 items-center justify-center rounded-xl border border-gray-200 text-gray-500 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
      >
        <Bell className="h-4 w-4" />
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold leading-none text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-2 w-[min(20rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-card dark:border-gray-800 dark:bg-gray-900">
          <p className="border-b border-gray-100 px-4 py-2.5 text-sm font-semibold text-gray-900 dark:border-gray-800 dark:text-gray-50">Notifications</p>
          {data === null ? (
            <p className="px-4 py-6 text-center text-sm text-gray-400">Loading...</p>
          ) : data.items.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-gray-400">Nothing new yet. New study materials, assignments and exams for your class will show up here.</p>
          ) : (
            <ul className="max-h-80 divide-y divide-gray-50 overflow-y-auto dark:divide-gray-800">
              {data.items.map((n) => {
                const Icon = ICONS[n.type] ?? Info;
                const body = (
                  <div className="flex items-start gap-2.5 px-4 py-3">
                    <span className={cn("mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary-600 dark:bg-primary-950 dark:text-primary-300")}>
                      <Icon className="h-3.5 w-3.5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5 text-sm font-medium text-gray-800 dark:text-gray-100">
                        {n.title}
                        {!n.read && <span className="h-1.5 w-1.5 rounded-full bg-primary-500" aria-label="new" />}
                      </span>
                      <span className="block text-xs text-gray-500 dark:text-gray-400">{n.message}</span>
                      <span className="mt-0.5 block text-[11px] text-gray-400">{formatDate(n.createdAt, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>
                    </span>
                  </div>
                );
                const href = LINKS[n.type];
                return (
                  <li key={n.id}>
                    {href ? (
                      <Link href={href} onClick={() => setOpen(false)} className="block hover:bg-gray-50 dark:hover:bg-gray-800/60">
                        {body}
                      </Link>
                    ) : (
                      body
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
