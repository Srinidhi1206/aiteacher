import { BarChart3 } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { ExamQuestionAnalyticsRow } from "@/lib/actions/exams";

const DIFFICULTY_VARIANT: Record<NonNullable<ExamQuestionAnalyticsRow["difficulty"]>, "success" | "warning" | "danger"> = {
  Easy: "success",
  Medium: "warning",
  Hard: "danger",
};

export function ExamQuestionAnalytics({ questions }: { questions: ExamQuestionAnalyticsRow[] }) {
  const hasAnyData = questions.some((q) => q.attempts > 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-primary-500" /> Question Analytics
        </CardTitle>
        <CardDescription className="hidden sm:block">Real correctness/marks per question, from actual student submissions</CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        {!hasAnyData ? (
          <p className="py-6 text-center text-sm text-gray-400">No submissions yet - question analytics will appear once students submit this exam.</p>
        ) : (
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-xs uppercase tracking-wide text-gray-400 dark:border-gray-800">
                <th className="py-2 pr-3 font-medium">#</th>
                <th className="py-2 pr-3 font-medium">Question</th>
                <th className="py-2 pr-3 font-medium">Type</th>
                <th className="py-2 pr-3 font-medium">Attempts</th>
                <th className="py-2 pr-3 font-medium">Correct</th>
                <th className="py-2 pr-3 font-medium">Incorrect</th>
                <th className="py-2 pr-3 font-medium">Unanswered</th>
                <th className="py-2 pr-3 font-medium">Avg Marks</th>
                <th className="py-2 pr-3 font-medium">Difficulty</th>
              </tr>
            </thead>
            <tbody>
              {questions.map((q) => (
                <tr key={q.questionId} className="border-b border-gray-50 last:border-0 dark:border-gray-800/60">
                  <td className="py-2.5 pr-3 text-gray-400">{q.order + 1}</td>
                  <td className="max-w-xs py-2.5 pr-3">
                    <p className="truncate font-medium text-gray-800 dark:text-gray-100">{q.prompt}</p>
                    {q.topicName && <p className="text-xs text-gray-400">{q.topicName}</p>}
                  </td>
                  <td className="py-2.5 pr-3 text-gray-500 dark:text-gray-400">{q.type.replace("_", " ")}</td>
                  <td className="py-2.5 pr-3 text-gray-500 dark:text-gray-400">{q.attempts}</td>
                  <td className="py-2.5 pr-3">
                    {q.accuracyPct != null ? <span className="font-medium text-success-600 dark:text-success-400">{q.correctCount}</span> : <span className="text-gray-400">—</span>}
                  </td>
                  <td className="py-2.5 pr-3">
                    {q.accuracyPct != null ? <span className="font-medium text-red-600 dark:text-red-400">{q.incorrectCount}</span> : <span className="text-gray-400">—</span>}
                  </td>
                  <td className="py-2.5 pr-3 text-gray-500 dark:text-gray-400">{q.unansweredCount}</td>
                  <td className="py-2.5 pr-3 text-gray-500 dark:text-gray-400">
                    {q.averageMarksAwarded != null ? `${q.averageMarksAwarded}/${q.marks}` : "Not graded yet"}
                  </td>
                  <td className="py-2.5 pr-3">
                    {q.difficulty ? (
                      <Badge variant={DIFFICULTY_VARIANT[q.difficulty]}>{q.difficulty}</Badge>
                    ) : (
                      <span className="text-xs text-gray-400">Not enough data</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}
