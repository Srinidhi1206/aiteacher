import Link from "next/link";
import { Award } from "lucide-react";
import { Topbar } from "@/components/layout/topbar";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DatabaseUnavailable } from "@/components/database-unavailable";
import { listResultsForStudent } from "@/lib/actions/exams";

export default async function ResultsPage() {
  let results: Awaited<ReturnType<typeof listResultsForStudent>>;
  try {
    results = await listResultsForStudent();
  } catch {
    return (
      <>
        <Topbar title="Results" />
        <main className="flex-1 p-4 sm:p-6">
          <DatabaseUnavailable what="Results" />
        </main>
      </>
    );
  }

  return (
    <>
      <Topbar title="Results" />
      <main className="flex-1 p-4 sm:p-6">
        {results.length === 0 ? (
          <Card className="flex min-h-[50vh] flex-col items-center justify-center text-center">
            <CardContent className="flex flex-col items-center gap-4 py-16">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary-50 text-primary-600 dark:bg-primary-950 dark:text-primary-300">
                <Award className="h-8 w-8" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-50">No results yet</h2>
                <p className="mt-2 max-w-md text-sm text-gray-500 dark:text-gray-400">
                  Complete your first exam to start seeing results here.
                </p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {results.map((r) => {
              const percentage = r.maxScore && r.totalScore != null ? Math.round((r.totalScore / r.maxScore) * 100) : null;
              return (
                <Link key={r.examId} href={`/exams/${r.examId}/results`}>
                  <Card className="transition-colors hover:border-primary-300 dark:hover:border-primary-700">
                    <CardContent className="flex items-center justify-between gap-3 py-4">
                      <div>
                        <p className="text-sm font-semibold text-gray-900 dark:text-gray-50">{r.examTitle}</p>
                        <p className="text-xs text-gray-400">
                          {r.subject} - {r.submittedAt ? new Date(r.submittedAt).toLocaleDateString() : ""}
                        </p>
                      </div>
                      {percentage != null ? (
                        <Badge variant={percentage >= 80 ? "success" : percentage >= 50 ? "warning" : "danger"}>{percentage}%</Badge>
                      ) : (
                        <Badge variant="outline">Pending review</Badge>
                      )}
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
      </main>
    </>
  );
}
