"use client";
import * as React from "react";
import { Check, Zap } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/components/ui/toast";
import { dailyGoals as initialGoals } from "@/lib/mock-data/achievements";
import { cn } from "@/lib/utils";

export function DailyGoalsCard() {
  const [goals, setGoals] = React.useState(initialGoals);
  const { showToast } = useToast();

  function toggleComplete(id: string) {
    setGoals((prev) =>
      prev.map((g) => {
        if (g.id !== id) return g;
        const isNowComplete = g.current < g.target;
        if (isNowComplete) showToast(`+${g.xpReward} XP earned`, `"${g.label}" marked complete for today.`);
        return { ...g, current: isNowComplete ? g.target : Math.max(0, g.target - 1) };
      })
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Today&apos;s Goals</CardTitle>
        <Zap className="h-4 w-4 text-warning-500" />
      </CardHeader>
      <CardContent className="space-y-3">
        {goals.map((goal) => {
          const done = goal.current >= goal.target;
          return (
            <button
              key={goal.id}
              onClick={() => toggleComplete(goal.id)}
              className="flex w-full items-center gap-3 rounded-xl border border-gray-100 p-3 text-left transition-colors hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-800/50"
            >
              <div
                className={cn(
                  "flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2",
                  done ? "border-success-500 bg-success-500 text-white" : "border-gray-300 dark:border-gray-600"
                )}
              >
                {done && <Check className="h-3.5 w-3.5" />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className={cn("truncate text-sm font-medium", done ? "text-gray-400 line-through" : "text-gray-800 dark:text-gray-100")}>
                    {goal.label}
                  </p>
                  <span className="shrink-0 text-xs font-semibold text-warning-600 dark:text-warning-400">+{goal.xpReward} XP</span>
                </div>
                <Progress value={(goal.current / goal.target) * 100} size="sm" className="mt-1.5" />
                <p className="mt-1 text-[11px] text-gray-400">
                  {goal.current}/{goal.target} {goal.unit}
                </p>
              </div>
            </button>
          );
        })}
      </CardContent>
    </Card>
  );
}
