import { Topbar } from "@/components/layout/topbar";
import { StudyPlanTabs } from "@/components/study-plan/study-plan-tabs";

export default function StudyPlanPage() {
  return (
    <>
      <Topbar title="Study Plan" />
      <main className="flex-1 p-4 sm:p-6">
        <StudyPlanTabs />
      </main>
    </>
  );
}
