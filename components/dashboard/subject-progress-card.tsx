import Link from "next/link";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { DynamicIcon } from "@/lib/icon-map";
import { subjects } from "@/lib/mock-data/subjects";

const colorClasses: Record<string, string> = {
  indigo: "bg-primary-100 text-primary-600 dark:bg-primary-950 dark:text-primary-300",
  sky: "bg-sky-100 text-sky-600 dark:bg-sky-950 dark:text-sky-300",
  emerald: "bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-300",
  rose: "bg-rose-100 text-rose-600 dark:bg-rose-950 dark:text-rose-300",
  amber: "bg-amber-100 text-amber-600 dark:bg-amber-950 dark:text-amber-300",
};

export function SubjectProgressCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Subject Progress</CardTitle>
        <Link href="/subjects" className="text-xs font-medium text-primary-600 hover:underline dark:text-primary-400">
          View all
        </Link>
      </CardHeader>
      <CardContent className="space-y-4">
        {subjects.map((subject) => (
          <div key={subject.id} className="flex items-center gap-3">
            <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${colorClasses[subject.color]}`}>
              <DynamicIcon name={subject.icon} className="h-[18px] w-[18px]" />
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-800 dark:text-gray-100">{subject.name}</span>
                <span className="text-xs font-semibold text-gray-500">{subject.progress}%</span>
              </div>
              <Progress value={subject.progress} size="sm" className="mt-1.5" />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
