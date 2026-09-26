// A finished practice session: score, and - only now - the answer key with
// explanations. Only the student who took it can see it.
import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2, XCircle, ArrowLeft } from "lucide-react";
import { Topbar } from "@/components/layout/topbar";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { DatabaseUnavailable } from "@/components/database-unavailable";
import { getPracticeResult } from "@/lib/actions/practice";

export default async function PracticeResultsPage({ params }: { params: { paperId: string } }) {
  let result: Awaited<ReturnType<typeof getPracticeResult>>;
  try {
    result = await getPracticeResult(params.paperId);
  } catch {
    return (
      <>
        <Topbar title="Practice results" />
        <main className="flex-1 p-4 sm:p-6">
          <DatabaseUnavailable what="Practice results" />
        </main>
      </>
    );
  }
  if (!result) notFound();

  return (
    <>
      <Topbar title="Practice results" />
      <main className="flex-1 space-y-4 p-4 sm:p-6">
        <Link href="/practice-papers" className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-gray-800 dark:hover:text-gray-200">
          <ArrowLeft className="h-4 w-4" /> Practice
        </Link>

        <Card>
          <CardContent className="space-y-3 p-5">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-50">{result.title}</h2>
            <p className="text-3xl font-bold text-gray-900 dark:text-gray-50">
              {result.score}/{result.total} <span className="text-base font-medium text-gray-400">({result.accuracy}%)</span>
            </p>
            <Progress value={result.accuracy} barClassName={result.accuracy >= 80 ? "bg-success-500" : result.accuracy >= 50 ? "bg-primary-500" : "bg-warning-500"} />
            <p className="text-xs text-gray-400">Your mastery of this topic, weak areas and strengths have been updated.</p>
          </CardContent>
        </Card>

        {result.questions.map((q, i) => (
          <Card key={i}>
            <CardContent className="space-y-3 p-5">
              <div className="flex items-start gap-2">
                {q.isCorrect ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success-500" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />}
                <p className="text-sm font-semibold text-gray-900 dark:text-gray-50">
                  <span className="mr-2 text-gray-400">{i + 1}.</span>
                  {q.prompt}
                </p>
              </div>
              <ul className="space-y-1.5 text-sm">
                {q.options.map((opt) => {
                  const isCorrect = opt === q.correctAnswer;
                  const isYours = opt === q.yourAnswer;
                  return (
                    <li
                      key={opt}
                      className={
                        isCorrect
                          ? "rounded-lg border border-success-200 bg-success-50 px-3 py-2 text-success-800 dark:border-success-900/40 dark:bg-success-900/20 dark:text-success-300"
                          : isYours
                            ? "rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-red-800 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300"
                            : "rounded-lg border border-gray-100 px-3 py-2 text-gray-600 dark:border-gray-800 dark:text-gray-300"
                      }
                    >
                      {opt}
                      {isCorrect && <span className="ml-2 text-xs font-semibold">Correct answer</span>}
                      {isYours && !isCorrect && <span className="ml-2 text-xs font-semibold">Your answer</span>}
                    </li>
                  );
                })}
                {q.yourAnswer === null && <li className="text-xs text-gray-400">You did not answer this question.</li>}
              </ul>
              <p className="text-xs text-gray-500 dark:text-gray-400">{q.explanation}</p>
              {!q.isCorrect && <p className="text-xs font-medium text-primary-700 dark:text-primary-300">Tip: {q.improvementTip}</p>}
            </CardContent>
          </Card>
        ))}
      </main>
    </>
  );
}
