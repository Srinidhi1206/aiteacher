// One exam's management page - questions, publish controls, analytics and submissions/grading. Shared by the teacher
// route (/teacher/exams/[id]) and the administrator route (/admin/exams/[id]); who may open a given exam is decided by
// the server actions it calls (lib/actions/exams.ts), not by which route renders it.
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Topbar } from "@/components/layout/topbar";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getExamForTeacher, listSubmissionsForExam, getExamQuestionAnalytics } from "@/lib/actions/exams";
import { QuestionBuilder } from "@/components/teacher/question-builder";
import { PublishExamControls } from "@/components/teacher/publish-exam-controls";
import { SubmissionsList } from "@/components/teacher/submissions-list";
import { ExamQuestionAnalytics } from "@/components/teacher/exam-question-analytics";
import { DatabaseUnavailable } from "@/components/database-unavailable";

export async function ExamManageView({ examId, backHref, backLabel }: { examId: string; backHref: string; backLabel: string }) {
  let exam: Awaited<ReturnType<typeof getExamForTeacher>>;
  let submissions: Awaited<ReturnType<typeof listSubmissionsForExam>>;
  let questionAnalytics: Awaited<ReturnType<typeof getExamQuestionAnalytics>>;
  try {
    exam = await getExamForTeacher(examId);
    submissions = exam ? await listSubmissionsForExam(exam.id) : [];
    questionAnalytics = exam ? await getExamQuestionAnalytics(exam.id) : [];
  } catch {
    return (
      <>
        <Topbar title="Exam" />
        <main className="flex-1 p-4 sm:p-6">
          <DatabaseUnavailable what="Exam management" />
        </main>
      </>
    );
  }
  if (!exam) {
    return (
      <>
        <Topbar title="Exam not found" />
        <main className="flex-1 space-y-3 p-6 text-sm text-gray-500">
          <p>This exam doesn&apos;t exist or you don&apos;t have access to it.</p>
          <Link href={backHref} className="inline-flex items-center gap-1.5 text-primary-600 hover:underline">
            <ArrowLeft className="h-3.5 w-3.5" /> {backLabel}
          </Link>
        </main>
      </>
    );
  }

  return (
    <>
      <Topbar title={exam.title} />
      <main className="flex-1 space-y-6 p-4 sm:p-6">
        <Link href={backHref} className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
          <ArrowLeft className="h-3.5 w-3.5" /> {backLabel}
        </Link>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>{exam.title}</CardTitle>
              <p className="mt-1 text-xs text-gray-400">
                {exam.subject.name} - {exam.schoolClass.label} - {exam.durationMinutes} min - {exam.maxMarks} marks
              </p>
            </div>
            <Badge variant={exam.status === "PUBLISHED" ? "success" : exam.status === "DRAFT" ? "outline" : "warning"}>{exam.status}</Badge>
          </CardHeader>
          <CardContent>
            <PublishExamControls examId={exam.id} status={exam.status} questionCount={exam.questions.length} />
          </CardContent>
        </Card>

        <QuestionBuilder examId={exam.id} questions={exam.questions} isDraft={exam.status === "DRAFT"} />

        {exam.status !== "DRAFT" && <ExamQuestionAnalytics questions={questionAnalytics} />}

        <SubmissionsList examId={exam.id} submissions={submissions} />
      </main>
    </>
  );
}
