"use client";
import { learningHeatmap } from "@/lib/mock-data/progress";
import type { HeatmapDay } from "@/lib/types";
import { cn } from "@/lib/utils";

const intensityClasses = [
  "bg-gray-100 dark:bg-gray-800",
  "bg-success-200 dark:bg-success-900/40",
  "bg-success-300 dark:bg-success-800/60",
  "bg-success-500 dark:bg-success-600",
  "bg-success-700 dark:bg-success-500",
];

// `data` is optional so the pre-existing dashboard usage (no prop) keeps
// its original mock behavior unchanged (Stage H doesn't touch the
// dashboard's mock Heatmap widget - see docs/STEP_3_5.md "Stage H
// detail"); /performance passes real data from getMyActivityHeatmap().
export function Heatmap({ data }: { data?: HeatmapDay[] } = {}) {
  const source = data ?? learningHeatmap;
  // Group into weeks (columns), 7 days each
  const weeks: HeatmapDay[][] = [];
  for (let i = 0; i < source.length; i += 7) {
    weeks.push(source.slice(i, i + 7));
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-none">
        {weeks.map((week, wIdx) => (
          <div key={wIdx} className="flex flex-col gap-1">
            {week.map((day) => (
              <div
                key={day.date}
                title={`${day.date}: ${day.count === 0 ? "No activity" : `${day.count}/4 intensity`}`}
                className={cn("h-3 w-3 rounded-sm", intensityClasses[day.count])}
              />
            ))}
          </div>
        ))}
      </div>
      <div className="flex items-center gap-1.5 text-xs text-gray-400">
        <span>Less</span>
        {intensityClasses.map((c, i) => (
          <div key={i} className={cn("h-3 w-3 rounded-sm", c)} />
        ))}
        <span>More</span>
      </div>
    </div>
  );
}
