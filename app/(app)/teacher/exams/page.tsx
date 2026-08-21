import Link from "next/link";
import { FileEdit } from "lucide-react";
import { Topbar } from "@/components/layout/topbar";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { listExamsForTeacher, listMyTeacherAssignments } from "@/lib/actions/exams";
import { CreateExamForm } from "@/components/teacher/create-exam-form";
import { DatabaseUnavailable } from "@/components/database-unavailable";

const statusVariant: Record<string, "outline" | "warning" | "success" | "primary"> = {
  DRAFT: "outline",
  PUBLISHED: "success",
  UNPUBLISHED: "warning",
  CLOSED: "primary",
};

export default async function TeacherExamsPage() {
  let exams: Awaited<ReturnType<typeof listExamsForTeacher>>;
  let assignments: Awaited<ReturnType<typeof listMyTeacherAssignments>>;
  try {
    [exams, assignments] = await Promise.all([listExamsForTeacher(), listMyTeacherAssignments()]);
  } catch {
    return (
      <>
        <Topbar title="Exams" />
        <main className="flex-1 p-4 sm:p-6">
          <DatabaseUnavailable what="Exam management" />
        </main>
      </>
    );
  }

  return (
    <>
      <Topbar title="Exams" />
      <main className="flex-1 space-y-6 p-4 sm:p-6">
        <CreateExamForm assignments={assignments} />

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileEdit className="h-4 w-4 text-primary-500" /> Your Exams
            </CardTitle>
            <CardDescription className="hidden sm:block">{exams.length} exams</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {exams.length === 0 ? (
              <p className="py-6 text-center text-sm text-gray-400">No exams yet. Create one above.</p>
            ) : (
              exams.map((exam) => (
                <Link
                  key={exam.id}
                  href={`/teacher/exams/${exam.id}`}
                  className="flex items-center justify-between rounded-xl border border-gray-100 p-3 transition-colors hover:border-primary-300 dark:border-gray-800 dark:hover:border-primary-700"
                >
                  <div>
                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-50">{exam.title}</p>
                    <p className="text-xs text-gray-400">
                      {exam.subject.name} - {exam.schoolClass.label} - {exam.questions.length} question{exam.questions.length === 1 ? "" : "s"} -{" "}
                      {exam.submissions.length} submission{exam.submissions.length === 1 ? "" : "s"}
                    </p>
                  </div>
                  <Badge variant={statusVariant[exam.status] ?? "outline"}>{exam.status}</Badge>
                </Link>
              ))
            )}
          </CardContent>
        </Card>
      </main>
    </>
  );
}
