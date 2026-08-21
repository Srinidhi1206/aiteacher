import { CheckCircle2, XCircle, Clock3 } from "lucide-react";
import { Topbar } from "@/components/layout/topbar";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DatabaseUnavailable } from "@/components/database-unavailable";
import { getExamResultForStudent } from "@/lib/actions/exams";

export default async function ExamResultsPage({ params }: { params: { examId: string } }) {
  let result: Awaited<ReturnType<typeof getExamResultForStudent>>;
  try {
    result = await getExamResultForStudent(params.examId);
  } catch {
    return (
      <>
        <Topbar title="Result" />
        <main className="flex-1 p-4 sm:p-6">
          <DatabaseUnavailable what="Exam results" />
        </main>
      </>
    );
  }

  if (!result) {
    return (
      <>
        <Topbar title="Result" />
        <main className="flex-1 p-6">
          <Card>
            <CardContent className="py-10 text-center text-sm text-gray-500 dark:text-gray-400">
              No result found. You may not have submitted this exam yet.
            </CardContent>
          </Card>
        </main>
      </>
    );
  }

  const percentage = result.maxScore ? Math.round(((result.totalScore ?? 0) / result.maxScore) * 100) : 0;

  return (
    <>
      <Topbar title={`${result.examTitle} - Result`} />
      <main className="flex-1 space-y-6 p-4 sm:p-6">
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-8 text-center">
            <Badge variant="primary">{result.subject}</Badge>
            {result.pendingReview ? (
              <>
                <div className="flex items-center gap-2 text-warning-600 dark:text-warning-400">
                  <Clock3 className="h-6 w-6" />
                  <span className="text-lg font-semibold">Pending teacher review</span>
                </div>
                <p className="max-w-md text-sm text-gray-500 dark:text-gray-400">
                  Your exam has been submitted. Some answers need to be reviewed by your teacher before a final score is available.
                </p>
              </>
            ) : (
              <>
                <p className="text-4xl font-bold text-gray-900 dark:text-gray-50">
                  {result.totalScore}/{result.maxScore}
                </p>
                <p className="text-lg font-semibold text-primary-600 dark:text-primary-400">{percentage}%</p>
              </>
            )}
            {result.feedback && (
              <p className="mt-2 max-w-md rounded-xl bg-gray-50 p-3 text-sm text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                <span className="font-semibold">Teacher feedback: </span>
                {result.feedback}
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Question-by-question</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {result.questions.map((q, i) => (
              <div key={i} className="rounded-xl border border-gray-100 p-3 dark:border-gray-800">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm font-medium text-gray-800 dark:text-gray-100">
                    {i + 1}. {q.prompt}
                  </p>
                  {q.marksAwarded != null ? (
                    <Badge variant={q.marksAwarded >= q.marks ? "success" : q.marksAwarded > 0 ? "warning" : "danger"}>
                      {q.marksAwarded}/{q.marks}
                    </Badge>
                  ) : (
                    <Badge variant="outline">Pending</Badge>
                  )}
                </div>
                <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">Your answer: {q.studentAnswer || "(no answer)"}</p>
                {q.correctAnswer && (
                  <p className="mt-1 flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
                    {q.isCorrect ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-success-500" />
                    ) : (
                      <XCircle className="h-3.5 w-3.5 text-red-500" />
                    )}
                    Correct answer: {q.correctAnswer}
                  </p>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      </main>
    </>
  );
}
