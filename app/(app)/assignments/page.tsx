// Real assignments: published worksheets from teachers of the student's own
// school + class (lib/actions/worksheets.ts), with the student's own
// submission state. Replaces the built-in sample assignments.
import { Topbar } from "@/components/layout/topbar";
import { DatabaseUnavailable } from "@/components/database-unavailable";
import { RealAssignmentsView } from "@/components/assignments/real-assignments-view";
import { listWorksheetsForStudent } from "@/lib/actions/worksheets";

export default async function AssignmentsPage() {
  let assignments: Awaited<ReturnType<typeof listWorksheetsForStudent>>;
  try {
    assignments = await listWorksheetsForStudent();
  } catch {
    return (
      <>
        <Topbar title="Assignments" />
        <main className="flex-1 p-4 sm:p-6">
          <DatabaseUnavailable what="Assignments" />
        </main>
      </>
    );
  }

  return (
    <>
      <Topbar title="Assignments" />
      <main className="flex-1 p-4 sm:p-6">
        <RealAssignmentsView assignments={assignments} />
      </main>
    </>
  );
}
