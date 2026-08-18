import { CalendarClock } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { upcomingExams } from "@/lib/mock-data/exams";
import { formatDate } from "@/lib/utils";

export function ExamCountdownCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Upcoming Exams</CardTitle>
        <CalendarClock className="h-4 w-4 text-gray-400" />
      </CardHeader>
      <CardContent className="space-y-4">
        {upcomingExams.map((exam) => (
          <div key={exam.id} className="rounded-xl border border-gray-100 p-3 dark:border-gray-800">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-gray-900 dark:text-gray-50">{exam.title}</p>
                <p className="text-xs text-gray-400">{formatDate(exam.date)} - {exam.type}</p>
              </div>
              <div className="flex shrink-0 flex-col items-center rounded-xl bg-primary-50 px-3 py-1 text-primary-700 dark:bg-primary-950 dark:text-primary-300">
                <span className="text-lg font-bold leading-none">{exam.daysLeft}</span>
                <span className="text-[10px] uppercase tracking-wide">days</span>
              </div>
            </div>
            <div className="mt-3 flex items-center gap-2">
              <Progress value={exam.syllabusCovered} size="sm" className="flex-1" />
              <Badge variant={exam.syllabusCovered >= 70 ? "success" : "warning"}>{exam.syllabusCovered}% ready</Badge>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
