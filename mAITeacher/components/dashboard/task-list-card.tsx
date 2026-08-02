"use client";
import * as React from "react";
import { CheckCircle2, Circle } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { todayTasks } from "@/lib/mock-data/study-plan";
import { cn } from "@/lib/utils";

const typeVariant: Record<string, "primary" | "success" | "warning" | "default" | "danger"> = {
  lesson: "primary",
  practice: "warning",
  revision: "default",
  assignment: "danger",
  quiz: "success",
};

export function TaskListCard() {
  const [tasks, setTasks] = React.useState(todayTasks);
  const completedCount = tasks.filter((t) => t.completed).length;

  const toggle = (id: string) => {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, completed: !t.completed } : t)));
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Today&apos;s Tasks</CardTitle>
        <Badge variant="primary">{completedCount}/{tasks.length} done</Badge>
      </CardHeader>
      <CardContent className="space-y-1">
        {tasks.map((task) => (
          <button
            key={task.id}
            onClick={() => toggle(task.id)}
            className="flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left transition-colors hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            {task.completed ? (
              <CheckCircle2 className="h-5 w-5 shrink-0 text-success-500" />
            ) : (
              <Circle className="h-5 w-5 shrink-0 text-gray-300 dark:text-gray-600" />
            )}
            <div className="min-w-0 flex-1">
              <p
                className={cn(
                  "truncate text-sm font-medium",
                  task.completed ? "text-gray-400 line-through" : "text-gray-800 dark:text-gray-100"
                )}
              >
                {task.title}
              </p>
              <p className="text-xs text-gray-400">
                {task.subject} - {task.time}
              </p>
            </div>
            <Badge variant={typeVariant[task.type] ?? "default"} className="shrink-0 capitalize">
              {task.type}
            </Badge>
          </button>
        ))}
      </CardContent>
    </Card>
  );
}
