import { Topbar } from "@/components/layout/topbar";
import { listWorksheetsForTeacher } from "@/lib/actions/worksheets";
import { listMyTeacherAssignments } from "@/lib/actions/exams";
import { CreateWorksheetForm } from "@/components/teacher/create-worksheet-form";
import { WorksheetsList } from "@/components/teacher/worksheets-list";
import { DatabaseUnavailable } from "@/components/database-unavailable";

export default async function TeacherWorksheetsPage() {
  let worksheets: Awaited<ReturnType<typeof listWorksheetsForTeacher>>;
  let assignments: Awaited<ReturnType<typeof listMyTeacherAssignments>>;
  try {
    [worksheets, assignments] = await Promise.all([listWorksheetsForTeacher(), listMyTeacherAssignments()]);
  } catch {
    return (
      <>
        <Topbar title="Worksheets" />
        <main className="flex-1 p-4 sm:p-6">
          <DatabaseUnavailable what="Worksheet management" />
        </main>
      </>
    );
  }

  return (
    <>
      <Topbar title="Worksheets" />
      <main className="flex-1 space-y-6 p-4 sm:p-6">
        <CreateWorksheetForm assignments={assignments} />
        <WorksheetsList worksheets={worksheets} />
      </main>
    </>
  );
}
