"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Circle } from "lucide-react";
import { setPlannerTaskStatus } from "@/lib/actions/planner";
import { completeLearningPathItem } from "@/lib/actions/analytics";
import { toggleCompletion } from "@/lib/dashboard/toggle-completion";
import { cn } from "@/lib/utils";
import { tickLabel } from "@/lib/study-plan/wording";

/** `source` says which table the row belongs to: a to-do the student wrote ("planner") or a study-plan item ("plan"); each has its own action, so a plan item's tick is really saved. */
export function RealPlannerTaskRow({ id, title, subject, done, source = "planner" }: { id: string; title: string; subject?: string | null; done: boolean; source?: "planner" | "plan" }) {
  const router = useRouter();
  const [completed, setCompleted] = React.useState(done);
  const [pending, setPending] = React.useState(false);

  async function toggle() {
    if (pending) return;
    await toggleCompletion({
      current: completed,
      save: (next) => (source === "plan" ? completeLearningPathItem(id, next) : setPlannerTaskStatus(id, next ? "COMPLETED" : "TODO")),
      setCompleted,
      setPending,
      // The counts around the tick (today's progress, the learning-path card) are read on the server, so they are refreshed after a successful save.
      onSaved: () => router.refresh(),
    });
  }

  return (
    <button
      onClick={toggle}
      // A study-plan tick is the student's own record, and says so to a screen reader: its name carries the action, so it has no aria-pressed. The student's own to-dos keep their own
      // words - their name is just the task, so the state is carried by aria-pressed.
      aria-label={source === "plan" ? tickLabel(completed, title) : undefined}
      aria-pressed={source === "plan" ? undefined : completed}
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
