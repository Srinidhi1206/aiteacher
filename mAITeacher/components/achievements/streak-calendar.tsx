"use client";
import { Flame } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { buildStreakCalendar } from "@/lib/mock-data/achievements";
import { currentStudent } from "@/lib/mock-data/students";
import { cn } from "@/lib/utils";

export function StreakCalendar() {
  const days = buildStreakCalendar(currentStudent.streakDays);
  const weeks: { date: string; active: boolean }[][] = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Streak Calendar</CardTitle>
        <span className="flex items-center gap-1 text-xs font-semibold text-warning-600 dark:text-warning-400">
          <Flame className="h-4 w-4" /> {currentStudent.streakDays} days
        </span>
      </CardHeader>
      <CardContent>
        <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          {weeks.map((week, wIdx) => (
            <div key={wIdx} className="flex flex-col gap-1.5">
              {week.map((day) => (
                <div
                  key={day.date}
                  title={day.date}
                  className={cn(
                    "flex h-5 w-5 items-center justify-center rounded-md",
                    day.active ? "bg-warning-500" : "bg-gray-100 dark:bg-gray-800"
                  )}
                >
                  {day.active && <Flame className="h-3 w-3 text-white" />}
                </div>
              ))}
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-gray-400">Last 35 days - each flame is a day you studied.</p>
      </CardContent>
    </Card>
  );
}
