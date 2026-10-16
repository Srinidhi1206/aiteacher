// The "Next exam" card itself - presentational only (no data fetching), so it can be rendered and tested on its own. The data comes from
// components/dashboard/next-exam-card.tsx. `exam` null = none upcoming; `failed` = the lookup was unavailable.
import * as React from "react";
import Link from "next/link";
import { GraduationCap, ArrowRight } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { describeDaysUntil, type NextExam } from "@/lib/calendar/next-exam";
import { formatDate } from "@/lib/utils";

const day = (iso: string) => formatDate(`${iso}T00:00:00Z`, { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

export function NextExamView({ exam, failed = false }: { exam: NextExam | null; failed?: boolean }) {
  const result = { ok: !failed, exam };
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <GraduationCap className="h-4 w-4 text-primary-600" /> Next exam
        </CardTitle>
        <Link href="/study-plan" className="inline-flex items-center gap-1 text-xs font-medium text-primary-600 hover:underline dark:text-primary-300">
          Study plan <ArrowRight className="h-3 w-3" />
        </Link>
      </CardHeader>
      <CardContent>
        {!result.ok ? (
          <p className="py-3 text-sm text-gray-400">This couldn&apos;t be loaded right now - refresh in a moment.</p>
        ) : !result.exam ? (
          <p className="py-3 text-sm text-gray-400">No upcoming exam is on your calendar yet. When your school publishes exam dates, the next one shows here.</p>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-base font-semibold text-gray-900 dark:text-gray-50">{result.exam.label}</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {day(result.exam.startDate)}
                {result.exam.endDate ? ` to ${day(result.exam.endDate)}` : ""}
                {result.exam.papers.length === 1 ? ` - ${result.exam.papers[0].subjectName}` : ""}
              </p>
            </div>
            <Badge variant={result.exam.status === "upcoming" && result.exam.daysUntil > 7 ? "primary" : "warning"} className="text-sm" data-testid="next-exam-badge">
              {describeDaysUntil(result.exam.daysUntil, result.exam.status === "ongoing")}
            </Badge>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
