import type { LucideIcon } from "lucide-react";
import { BLOOM_LEVELS, BloomLevel } from "@/lib/types";
import { Brain, Lightbulb, Wrench, Search } from "lucide-react";
import { cn } from "@/lib/utils";

const levelIcon: Record<BloomLevel, LucideIcon> = {
  Remember: Brain,
  Understand: Lightbulb,
  Apply: Wrench,
  Analyze: Search,
};

const levelColor: Record<BloomLevel, string> = {
  Remember: "bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-300",
  Understand: "bg-sky-200 text-sky-700 dark:bg-sky-900/50 dark:text-sky-300",
  Apply: "bg-primary-200 text-primary-700 dark:bg-primary-900/50 dark:text-primary-300",
  Analyze: "bg-success-200 text-success-700 dark:bg-success-900/50 dark:text-success-300",
};

const levelColorActive: Record<BloomLevel, string> = {
  Remember: "bg-gray-500 text-white",
  Understand: "bg-sky-500 text-white",
  Apply: "bg-primary-600 text-white",
  Analyze: "bg-success-500 text-white",
};

export function BloomLevelChart({ currentLevel }: { currentLevel: BloomLevel }) {
  const currentIndex = BLOOM_LEVELS.indexOf(currentLevel);

  return (
    <div className="flex items-center gap-1 sm:gap-2">
      {BLOOM_LEVELS.map((level, idx) => {
        const Icon = levelIcon[level];
        const isCurrent = idx === currentIndex;
        const isPast = idx < currentIndex;
        return (
          <div key={level} className="flex flex-1 items-center gap-1 sm:gap-2">
            <div className="flex flex-1 flex-col items-center gap-1.5">
              <div
                className={cn(
                  "flex h-10 w-10 items-center justify-center rounded-full transition-all",
                  isCurrent ? levelColorActive[level] : isPast ? levelColorActive[level] + " opacity-60" : levelColor[level]
                )}
              >
                <Icon className="h-5 w-5" />
              </div>
              <span
                className={cn(
                  "text-center text-[11px] font-medium leading-tight",
                  isCurrent ? "text-gray-900 dark:text-gray-50" : "text-gray-400"
                )}
              >
                {level}
              </span>
            </div>
            {idx < BLOOM_LEVELS.length - 1 && (
              <div className={cn("mb-5 h-0.5 flex-1 rounded-full", idx < currentIndex ? "bg-primary-400" : "bg-gray-200 dark:bg-gray-700")} />
            )}
          </div>
        );
      })}
    </div>
  );
}
