import { Topbar } from "@/components/layout/topbar";
import { ClassSubjectSelector } from "@/components/teacher/class-subject-selector";
import { CreateClassCard } from "@/components/teacher/create-class-card";
import { UploadMaterialCard } from "@/components/teacher/upload-material-card";
import { CreateExamsCard } from "@/components/teacher/create-exams-card";
import { ManageWorksheetsCard } from "@/components/teacher/manage-worksheets-card";
import { GradeSubmissionsCard } from "@/components/teacher/grade-submissions-card";
import { RealClassAnalytics } from "@/components/teacher/real-class-analytics";

export default function TeacherDashboardPage() {
  return (
    <>
      <Topbar title="Teacher View" />
      <main className="flex-1 space-y-6 p-4 sm:p-6">
        <ClassSubjectSelector />
        <CreateClassCard />
        <CreateExamsCard />
        <ManageWorksheetsCard />

        <UploadMaterialCard />

        <GradeSubmissionsCard />

        <div className="flex items-center gap-2">
          <div className="h-px flex-1 bg-gray-100 dark:bg-gray-800" />
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Real class analytics (your own exams &amp; assignments)</p>
          <div className="h-px flex-1 bg-gray-100 dark:bg-gray-800" />
        </div>

        <RealClassAnalytics />
      </main>
    </>
  );
}
