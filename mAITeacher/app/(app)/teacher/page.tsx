import { Topbar } from "@/components/layout/topbar";
import { CreateClassCard } from "@/components/teacher/create-class-card";
import { UploadMaterialCard } from "@/components/teacher/upload-material-card";
import { CreateExamsCard } from "@/components/teacher/create-exams-card";
import { StudentAnalyticsTable } from "@/components/teacher/student-analytics-table";
import { ClassWeakConceptsCard } from "@/components/teacher/class-weak-concepts-card";

export default function TeacherDashboardPage() {
  return (
    <>
      <Topbar title="Teacher View" />
      <main className="flex-1 space-y-6 p-4 sm:p-6">
        <CreateClassCard />
        <CreateExamsCard />

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <UploadMaterialCard />
          <ClassWeakConceptsCard />
        </div>

        <StudentAnalyticsTable />
      </main>
    </>
  );
}
