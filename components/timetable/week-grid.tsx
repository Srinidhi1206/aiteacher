"use client";
// A week's periods, day by day. Used on the student's Timetable page, in the administrator's view of a saved timetable and in
// the import preview ("how it will look"). Purely presentational: it shows exactly the rows it is given.
import * as React from "react";
import { cn } from "@/lib/utils";
import { DAY_NAMES } from "@/lib/timetable/parts";

export interface GridEntry {
  id: string;
  day: number;
  period: number | null;
  startTime: string | null;
  endTime: string | null;
  subjectName: string;
  teacherName: string | null;
  room: string | null;
  /** Optional flag (used by the import preview to mark a row that needs review). */
  flagged?: boolean;
}

export function WeekGrid({ entries, highlightToday = false }: { entries: GridEntry[]; highlightToday?: boolean }) {
  // "today" is the viewer's own day, so it is worked out in the browser.
  const [today, setToday] = React.useState<number | null>(null);
  React.useEffect(() => {
    if (!highlightToday) return;
    const js = new Date().getDay(); // 0 = Sunday
    setToday(js === 0 ? 7 : js);
  }, [highlightToday]);

  const days = [...new Set(entries.map((e) => e.day))].filter((d) => d >= 1 && d <= 7).sort((a, b) => a - b);
  if (days.length === 0) return <p className="py-6 text-center text-sm text-gray-400">No periods to show.</p>;

  return (
    <div className={cn("grid gap-3", days.length >= 5 ? "md:grid-cols-3 xl:grid-cols-5" : days.length >= 3 ? "md:grid-cols-3" : "md:grid-cols-2")}>
      {days.map((day) => {
        const rows = entries
          .filter((e) => e.day === day)
          .sort((a, b) => (a.startTime ?? "99:99").localeCompare(b.startTime ?? "99:99") || (a.period ?? 99) - (b.period ?? 99));
        return (
          <section key={day} className={cn("rounded-2xl border p-3", today === day ? "border-primary-300 bg-primary-50/40 dark:border-primary-800 dark:bg-primary-950/20" : "border-gray-100 dark:border-gray-800")}>
            <h3 className="mb-2 flex items-center justify-between text-sm font-semibold text-gray-900 dark:text-gray-50">
              {DAY_NAMES[day]}
              {today === day && <span className="rounded-full bg-primary-600 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">Today</span>}
            </h3>
            <ul className="space-y-1.5">
              {rows.map((e) => (
                <li key={e.id} className={cn("rounded-xl border px-2.5 py-2 text-sm", e.flagged ? "border-warning-300 bg-warning-50/50 dark:border-warning-700 dark:bg-warning-950/20" : "border-gray-100 bg-white dark:border-gray-800 dark:bg-gray-900")}>
                  <p className="flex flex-wrap items-baseline justify-between gap-x-2 text-xs text-gray-500 dark:text-gray-400">
                    <span>{e.period ? `Period ${e.period}` : " "}</span>
                    <span className="tabular-nums">{e.startTime && e.endTime ? `${e.startTime}–${e.endTime}` : ""}</span>
                  </p>
                  <p className="font-medium text-gray-800 dark:text-gray-100">{e.subjectName}</p>
                  {(e.teacherName || e.room) && (
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {[e.teacherName, e.room ? `Room ${e.room}` : null].filter(Boolean).join(" · ")}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
