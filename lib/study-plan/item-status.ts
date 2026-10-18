// What state a study-plan task is in for the student, and which one is "next". Pure, so it is tested on its own and the Study Plan page and the dashboard agree.
//
//   done     - ticked off (whenever it was planned for);
//   missed   - NOT done, and planned for a day that has already passed (the Indian calendar day, see lib/calendar/day.ts);
//   today    - not done, planned for today;
//   upcoming - not done, planned for a later day.
//
// Dates are the plan's "yyyy-mm-dd" day keys (made on the server from the stored value), never a Date shown in whatever zone the browser happens to be in.
export type TaskState = "done" | "missed" | "today" | "upcoming";

export interface PlanTaskLike {
  completed: boolean;
  /** The day the task is planned for, "yyyy-mm-dd". */
  dateKey: string;
}

export function taskState(task: PlanTaskLike, today: string): TaskState {
  if (task.completed) return "done";
  if (task.dateKey < today) return "missed";
  return task.dateKey === today ? "today" : "upcoming";
}

export interface PlanProgress {
  total: number;
  done: number;
  missed: number;
  /** Not done and planned for today or later. */
  ahead: number;
}

export function planProgress(tasks: PlanTaskLike[], today: string): PlanProgress {
  const counts = { done: 0, missed: 0, ahead: 0 };
  for (const t of tasks) {
    const s = taskState(t, today);
    if (s === "done") counts.done++;
    else if (s === "missed") counts.missed++;
    else counts.ahead++;
  }
  return { total: tasks.length, ...counts };
}

/** The first task still to do from today on, in the order given (a plan is listed by day). A missed task is never "next up": the day it was for has gone. */
export function nextUpTask<T extends PlanTaskLike>(tasks: T[], today: string): T | null {
  return tasks.find((t) => !t.completed && t.dateKey >= today) ?? null;
}

/** "Fri, Oct 16" for a day key, the same in every time zone. */
export function formatDayKey(dateKey: string): string {
  return new Date(`${dateKey}T00:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
}
