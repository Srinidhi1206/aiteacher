import { CalendarCheck2, ListChecks, RotateCcw, ClipboardCheck, AlarmClock } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import type { ExamPlanOutput } from "@/lib/types";

export function ExamPlanResult({ plan }: { plan: ExamPlanOutput }) {
  return (
    <div className="space-y-6">
      <Card className="border-success-200 bg-success-50/60 dark:border-success-900 dark:bg-success-950/20">
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-5">
          <div>
            <p className="text-sm font-semibold text-gray-900 dark:text-gray-50">
              Plan ready for {plan.input.examName}
            </p>
            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
              {plan.totalDays} days until {formatDate(plan.input.examDate)} - {plan.input.availableHoursPerDay}h/day - {plan.input.weightage}% weightage
            </p>
          </div>
          <Badge variant={plan.input.priority === "High" ? "danger" : plan.input.priority === "Medium" ? "warning" : "outline"}>
            {plan.input.priority} priority
          </Badge>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarCheck2 className="h-4 w-4 text-primary-500" /> Daily Goals
            </CardTitle>
          </CardHeader>
          <CardContent className="max-h-72 space-y-2 overflow-y-auto">
            {plan.dailyGoals.map((g) => (
              <div key={g.day} className="flex items-center justify-between gap-2 rounded-xl border border-gray-100 p-2.5 text-sm dark:border-gray-800">
                <div>
                  <span className="font-medium text-gray-800 dark:text-gray-100">Day {g.day}</span>
                  <span className="ml-2 text-xs text-gray-400">{formatDate(g.date, { month: "short", day: "numeric" })}</span>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{g.goal}</p>
                </div>
                <span className="shrink-0 text-xs font-semibold text-gray-400">{g.hours}h</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ListChecks className="h-4 w-4 text-primary-500" /> Weekly Goals
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {plan.weeklyGoals.map((w) => (
              <div key={w.week} className="rounded-xl border border-gray-100 p-2.5 text-sm dark:border-gray-800">
                <span className="font-medium text-gray-800 dark:text-gray-100">Week {w.week}</span>
                <p className="text-xs text-gray-500 dark:text-gray-400">{w.goal}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <RotateCcw className="h-4 w-4 text-sky-500" /> Revision Schedule
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {plan.revisionSchedule.map((r, i) => (
              <div key={i} className="flex items-center justify-between rounded-xl border border-gray-100 p-2.5 text-sm dark:border-gray-800">
                <span className="text-gray-700 dark:text-gray-200">{r.topic}</span>
                <span className="text-xs text-gray-400">{formatDate(r.date, { month: "short", day: "numeric" })}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ClipboardCheck className="h-4 w-4 text-red-500" /> Mock Test Schedule
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {plan.mockTestSchedule.map((m, i) => (
              <div key={i} className="flex items-center justify-between rounded-xl border border-gray-100 p-2.5 text-sm dark:border-gray-800">
                <span className="text-gray-700 dark:text-gray-200">{m.title}</span>
                <span className="text-xs text-gray-400">{formatDate(m.date, { month: "short", day: "numeric" })}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlarmClock className="h-4 w-4 text-warning-500" /> Last-Minute Revision Plan
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="list-disc space-y-1.5 pl-5 text-sm text-gray-600 dark:text-gray-300">
            {plan.lastMinutePlan.map((tip, i) => (
              <li key={i}>{tip}</li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
