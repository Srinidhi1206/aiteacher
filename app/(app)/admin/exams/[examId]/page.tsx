// An administrator managing one exam - the same management view a teacher gets, reached from Admin -> Exams & Assignments.
// The /admin prefix is admin-only (middleware); which exams an administrator may open is decided by the server actions
// (their own school's, or any school for the super administrator).
import { ExamManageView } from "@/components/teacher/exam-manage-view";

export default function AdminExamDetailPage({ params }: { params: { examId: string } }) {
  return <ExamManageView examId={params.examId} backHref="/admin?tab=academics" backLabel="Back to Exams & Assignments" />;
}
