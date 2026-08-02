"use client";
import { Lock } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { DynamicIcon } from "@/lib/icon-map";
import { achievements } from "@/lib/mock-data/achievements";
import { formatDate, cn } from "@/lib/utils";

const categoryLabel: Record<string, string> = {
  streak: "Streak",
  mastery: "Mastery",
  practice: "Practice",
  milestone: "Milestone",
  social: "Social",
};

export function BadgeGrid() {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-5">
      {achievements.map((a) => (
        <Card
          key={a.id}
          className={cn(
            "flex flex-col items-center gap-2 p-4 text-center transition-opacity",
            !a.unlocked && "opacity-70"
          )}
        >
          <div
            className={cn(
              "flex h-14 w-14 items-center justify-center rounded-2xl",
              a.unlocked
                ? "bg-gradient-to-br from-primary-500 to-violet-600 text-white"
                : "bg-gray-100 text-gray-400 dark:bg-gray-800"
            )}
          >
            {a.unlocked ? <DynamicIcon name={a.icon} className="h-7 w-7" /> : <Lock className="h-6 w-6" />}
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-900 dark:text-gray-50">{a.title}</p>
            <p className="mt-0.5 text-[11px] leading-snug text-gray-400">{a.description}</p>
          </div>
          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-500 dark:bg-gray-800 dark:text-gray-400">
            {categoryLabel[a.category]}
          </span>
          {a.unlocked ? (
            <p className="text-[10px] text-success-600 dark:text-success-400">Unlocked {a.unlockedDate && formatDate(a.unlockedDate)}</p>
          ) : (
            <div className="w-full">
              <Progress value={a.progress ?? 0} size="sm" />
              <p className="mt-1 text-[10px] text-gray-400">{a.progress ?? 0}% complete</p>
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}
