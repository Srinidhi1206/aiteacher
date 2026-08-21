import Link from "next/link";
import { FileEdit, Clock, Award } from "lucide-react";
import { Topbar } from "@/components/layout/topbar";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DatabaseUnavailable } from "@/components/database-unavailable";
import { listExamsForStudent } from "@/lib/actions/exams";

export default async function ExamsPage() {
  let exams: Awaited<ReturnType<typeof listExamsForStudent>>;
  try {
    exams = await listExamsForStudent();
  } catch {
    return (
      <>
        <Topbar title="Exams" />
        <main className="flex-1 p-4 sm:p-6">
          <DatabaseUnavailable what="Exams" />
        </main>
      </>
    );
  }

  return (
    <>
      <Topbar title="Exams" />
      <main className="flex-1 space-y-4 p-4 sm:p-6">
        {exams.length === 0 ? (
          <Card className="flex min-h-[50vh] flex-col items-center justify-center text-center">
            <CardContent className="flex flex-col items-center gap-4 py-16">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary-50 text-primary-600 dark:bg-primary-950 dark:text-primary-300">
                <FileEdit className="h-8 w-8" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-50">No exams published yet</h2>
                <p className="mt-2 max-w-md text-sm text-gray-500 dark:text-gray-400">
                  Your teacher hasn&apos;t published any exams for your class yet.
                </p>
              </div>
            </CardContent>
          </Card>
        ) : (
          exams.map((exam) => {
            const submission = exam.submissions[0];
            const status = submission?.status ?? "NOT_STARTED";
            return (
              <Card key={exam.id}>
                <CardHeader>
                  <div>
                    <CardTitle>{exam.title}</CardTitle>
                    <CardDescription>{exam.subject.name}</CardDescription>
                  </div>
                  <Badge
                    variant={status === "GRADED" ? "success" : status === "SUBMITTED" ? "primary" : status === "IN_PROGRESS" ? "warning" : "outline"}
                  >
                    {status === "NOT_STARTED" ? "Not started" : status === "IN_PROGRESS" ? "In progress" : status === "SUBMITTED" ? "Submitted" : "Graded"}
                  </Badge>
                </CardHeader>
                <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex flex-wrap items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
                    <span className="flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5" /> {exam.durationMinutes} min
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Award className="h-3.5 w-3.5" /> {exam.maxMarks} marks
                    </span>
                    {exam.chapterScope && <span>{exam.chapterScope}</span>}
                  </div>
                  {status === "SUBMITTED" || status === "GRADED" ? (
                    <Link href={`/exams/${exam.id}/results`}>
                      <Button size="sm" variant="outline">
                        View Result
                      </Button>
                    </Link>
                  ) : (
                    <Link href={`/exams/${exam.id}/attempt`}>
                      <Button size="sm">{status === "IN_PROGRESS" ? "Continue Exam" : "Start Exam"}</Button>
                    </Link>
                  )}
                </CardContent>
              </Card>
            );
          })
        )}
      </main>
    </>
  );
}
