import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { DynamicIcon } from "@/lib/icon-map";
import { todayTasks } from "@/lib/mock-data/study-plan";
import { cn } from "@/lib/utils";

const typeIcon: Record<string, string> = {
  lesson: "BookOpen",
  practice: "PenTool",
  revision: "RotateCcw",
  assignment: "ClipboardList",
  quiz: "HelpCircle",
};

export function StudyPlanCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Today&apos;s Study Plan</CardTitle>
      </CardHeader>
      <CardContent>
        <ol className="relative space-y-5 border-l-2 border-dashed border-gray-200 pl-5 dark:border-gray-700">
          {todayTasks.map((task) => (
            <li key={task.id} className="relative">
              <span
                className={cn(
                  "absolute -left-[27px] flex h-6 w-6 items-center justify-center rounded-full ring-4 ring-white dark:ring-gray-900",
                  task.completed ? "bg-success-500 text-white" : "bg-primary-100 text-primary-600 dark:bg-primary-950 dark:text-primary-300"
                )}
              >
                <DynamicIcon name={typeIcon[task.type]} className="h-3 w-3" />
              </span>
              <p className="text-xs font-medium text-gray-400">{task.time}</p>
              <p className={cn("text-sm font-medium", task.completed ? "text-gray-400 line-through" : "text-gray-800 dark:text-gray-100")}>
                {task.title}
              </p>
              <p className="text-xs text-gray-400">{task.subject}</p>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}
