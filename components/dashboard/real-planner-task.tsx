"use client";
import * as React from "react";
import { CheckCircle2, Circle } from "lucide-react";
import { setPlannerTaskStatus } from "@/lib/actions/planner";
import { cn } from "@/lib/utils";

export function RealPlannerTaskRow({ id, title, subject, done }: { id: string; title: string; subject?: string | null; done: boolean }) {
  const [completed, setCompleted] = React.useState(done);
  const [pending, setPending] = React.useState(false);

  async function toggle() {
    setPending(true);
    const next = !completed;
    setCompleted(next);
    await setPlannerTaskStatus(id, next ? "COMPLETED" : "TODO");
    setPending(false);
  }

  return (
    <button
      onClick={toggle}
      disabled={pending}
      className="flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-left transition-colors hover:bg-gray-50 dark:hover:bg-gray-800"
    >
      {completed ? (
        <CheckCircle2 className="h-4 w-4 shrink-0 text-success-500" />
      ) : (
        <Circle className="h-4 w-4 shrink-0 text-gray-300 dark:text-gray-600" />
      )}
      <span className={cn("text-sm", completed ? "text-gray-400 line-through" : "text-gray-800 dark:text-gray-100")}>
        {title}
        {subject && <span className="ml-1.5 text-xs text-gray-400">- {subject}</span>}
      </span>
    </button>
  );
}
