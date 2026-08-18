"use client";
import { cn } from "@/lib/utils";

export type QuestionNavState = "answered" | "flagged" | "unanswered" | "current";

export function QuestionNavigator({
  total,
  states,
  onJump,
}: {
  total: number;
  states: QuestionNavState[];
  onJump: (index: number) => void;
}) {
  return (
    <div>
      <div className="grid grid-cols-6 gap-2 sm:grid-cols-8">
        {Array.from({ length: total }).map((_, i) => {
          const state = states[i];
          return (
            <button
              key={i}
              onClick={() => onJump(i)}
              className={cn(
                "flex h-9 w-9 items-center justify-center rounded-lg text-xs font-semibold transition-colors",
                state === "current" && "ring-2 ring-primary-500 ring-offset-1 dark:ring-offset-gray-900",
                state === "answered" || state === "current"
                  ? "bg-primary-600 text-white"
                  : state === "flagged"
                  ? "bg-warning-100 text-warning-700 dark:bg-warning-900/30 dark:text-warning-400"
                  : "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400"
              )}
            >
              {i + 1}
            </button>
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-gray-400">
        <span className="flex items-center gap-1">
          <span className="h-2.5 w-2.5 rounded-full bg-primary-600" /> Answered
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2.5 w-2.5 rounded-full bg-warning-400" /> Flagged
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2.5 w-2.5 rounded-full bg-gray-300 dark:bg-gray-700" /> Unanswered
        </span>
      </div>
    </div>
  );
}
