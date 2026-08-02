import { Brain, Lightbulb, Search, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";

const levelMeta = [
  { level: 1, label: "Remember", icon: Brain },
  { level: 2, label: "Understand", icon: Lightbulb },
  { level: 3, label: "Apply", icon: Wrench },
  { level: 4, label: "Analyze", icon: Search },
] as const;

export function LessonProgressBar({ currentLevel, questionsDone, questionsTotal }: { currentLevel: number; questionsDone: number; questionsTotal: number }) {
  return (
    <div>
      <div className="flex items-center gap-1 sm:gap-2">
        {levelMeta.map(({ level, label, icon: Icon }, idx) => {
          const isCurrent = level === currentLevel;
          const isPast = level < currentLevel;
          return (
            <div key={level} className="flex flex-1 items-center gap-1 sm:gap-2">
              <div className="flex flex-1 flex-col items-center gap-1.5">
                <div
                  className={cn(
                    "flex h-9 w-9 items-center justify-center rounded-full transition-all",
                    isCurrent || isPast ? "bg-primary-600 text-white" : "bg-gray-100 text-gray-400 dark:bg-gray-800"
                  )}
                >
                  <Icon className="h-4 w-4" />
                </div>
                <span className={cn("text-center text-[10px] font-medium leading-tight sm:text-[11px]", isCurrent ? "text-gray-900 dark:text-gray-50" : "text-gray-400")}>
                  {label}
                </span>
              </div>
              {idx < levelMeta.length - 1 && (
                <div className={cn("mb-5 h-0.5 flex-1 rounded-full", level < currentLevel ? "bg-primary-400" : "bg-gray-200 dark:bg-gray-700")} />
              )}
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-center text-xs text-gray-400">
        Question {questionsDone + 1} of {questionsTotal}
      </p>
    </div>
  );
}
