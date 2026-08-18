"use client";
import * as React from "react";
import { BookOpen, RotateCcw, PenTool, ClipboardCheck, Coffee, Check } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { studyPlanSchedule } from "@/lib/mock-data/study-plan";
import { formatDate, cn } from "@/lib/utils";
import type { StudyPlanItemKind } from "@/lib/types";

const kindMeta: Record<StudyPlanItemKind, { label: string; icon: typeof BookOpen; classes: string }> = {
  topic: { label: "New Topic", icon: BookOpen, classes: "bg-primary-100 text-primary-600 dark:bg-primary-950 dark:text-primary-300" },
  revision: { label: "Revision", icon: RotateCcw, classes: "bg-sky-100 text-sky-600 dark:bg-sky-950 dark:text-sky-300" },
  practice: { label: "Practice", icon: PenTool, classes: "bg-warning-100 text-warning-600 dark:bg-warning-900/40 dark:text-warning-400" },
  "mock-test": { label: "Mock Test", icon: ClipboardCheck, classes: "bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400" },
  buffer: { label: "Buffer Day", icon: Coffee, classes: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400" },
};

export function ScheduleTimeline() {
  const [items, setItems] = React.useState(studyPlanSchedule);

  const byDay = React.useMemo(() => {
    const map = new Map<number, typeof items>();
    for (const item of items) {
      const list = map.get(item.day) ?? [];
      list.push(item);
      map.set(item.day, list);
    }
    return Array.from(map.entries()).sort((a, b) => a[0] - b[0]);
  }, [items]);

  function toggleItem(id: string) {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, completed: !i.completed } : i)));
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Your Generated Study Plan</CardTitle>
        <span className="text-xs text-gray-400">Next 12 days</span>
      </CardHeader>
      <CardContent>
        <div className="space-y-5">
          {byDay.map(([day, dayItems]) => (
            <div key={day} className="flex gap-3">
              <div className="flex w-16 shrink-0 flex-col items-center pt-1">
                <span className="text-xs font-semibold text-gray-400">Day {day}</span>
                <span className="text-[11px] text-gray-400">{formatDate(dayItems[0].date, { month: "short", day: "numeric" })}</span>
              </div>
              <div className="flex-1 space-y-2 border-l border-gray-100 pb-1 pl-4 dark:border-gray-800">
                {dayItems.map((item) => {
                  const meta = kindMeta[item.kind];
                  const Icon = meta.icon;
                  return (
                    <button
                      key={item.id}
                      onClick={() => item.kind !== "buffer" && toggleItem(item.id)}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-xl border border-gray-100 p-3 text-left transition-colors dark:border-gray-800",
                        item.kind !== "buffer" && "hover:bg-gray-50 dark:hover:bg-gray-800/50"
                      )}
                    >
                      <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl", meta.classes)}>
                        <Icon className="h-[18px] w-[18px]" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className={cn("truncate text-sm font-medium", item.completed ? "text-gray-400 line-through" : "text-gray-800 dark:text-gray-100")}>
                            {item.title}
                          </p>
                          <Badge variant="outline" className="shrink-0">{meta.label}</Badge>
                        </div>
                        <p className="mt-0.5 text-xs text-gray-400">
                          {item.subject}
                          {item.durationMinutes > 0 ? ` - ${item.durationMinutes} min` : ""}
                        </p>
                      </div>
                      {item.kind !== "buffer" && (
                        <div
                          className={cn(
                            "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2",
                            item.completed ? "border-success-500 bg-success-500 text-white" : "border-gray-300 dark:border-gray-600"
                          )}
                        >
                          {item.completed && <Check className="h-3.5 w-3.5" />}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
