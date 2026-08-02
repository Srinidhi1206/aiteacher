import { Flame } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { currentStudent } from "@/lib/mock-data/students";
import { weeklyDots } from "@/lib/mock-data/progress";
import { cn } from "@/lib/utils";

export function StreakCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Learning Streak</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-3">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-warning-100 text-warning-600 dark:bg-warning-900/30 dark:text-warning-400">
            <Flame className="h-7 w-7" />
          </div>
          <div>
            <p className="text-3xl font-bold text-gray-900 dark:text-gray-50">{currentStudent.streakDays}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">day streak - keep it up!</p>
          </div>
        </div>

        <div className="mt-5 flex items-center justify-between">
          {weeklyDots.map((dot) => (
            <div key={dot.day} className="flex flex-col items-center gap-1.5">
              <div
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold",
                  dot.active
                    ? "bg-warning-500 text-white"
                    : dot.isToday
                    ? "border-2 border-dashed border-warning-400 text-warning-500"
                    : "bg-gray-100 text-gray-400 dark:bg-gray-800"
                )}
              >
                {dot.active ? <Flame className="h-4 w-4" /> : dot.day[0]}
              </div>
              <span className="text-[10px] text-gray-400">{dot.day}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
