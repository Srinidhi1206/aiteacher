import { Topbar } from "@/components/layout/topbar";
import { AssignmentsView } from "@/components/assignments/assignments-view";

export default function AssignmentsPage() {
  return (
    <>
      <Topbar title="Assignments" />
      <main className="flex-1 p-4 sm:p-6">
        <AssignmentsView />
      </main>
    </>
  );
}
