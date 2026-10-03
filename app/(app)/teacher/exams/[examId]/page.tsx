import { ExamManageView } from "@/components/teacher/exam-manage-view";

export default function TeacherExamDetailPage({ params }: { params: { examId: string } }) {
  return <ExamManageView examId={params.examId} backHref="/teacher/exams" backLabel="Back to Exams" />;
}
