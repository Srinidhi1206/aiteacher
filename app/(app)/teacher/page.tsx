// Teacher dashboard: only real tools - exams, worksheets/assignments and class
// analytics, all gated on the teacher's own class/subject assignments and
// school. The old sample cards (class selector, Create Class, Upload Material,
// Grade Submissions) were removed: they saved nothing. Study materials are
// uploaded by the school administrator; exams are graded from the exam page.
import { Topbar } from "@/components/layout/topbar";
import { CreateExamsCard } from "@/components/teacher/create-exams-card";
import { ManageWorksheetsCard } from "@/components/teacher/manage-worksheets-card";
import { RealClassAnalytics } from "@/components/teacher/real-class-analytics";
import { UpcomingEventsCard } from "@/components/teacher/upcoming-events-card";

export default function TeacherDashboardPage() {
  return (
    <>
      <Topbar title="Teacher View" />
      <main className="flex-1 space-y-6 p-4 sm:p-6">
        <UpcomingEventsCard />
        <CreateExamsCard />
        <ManageWorksheetsCard />

        <div className="flex items-center gap-2">
          <div className="h-px flex-1 bg-gray-100 dark:bg-gray-800" />
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Class analytics (your own exams &amp; assignments)</p>
          <div className="h-px flex-1 bg-gray-100 dark:bg-gray-800" />
        </div>

        <RealClassAnalytics />
      </main>
    </>
  );
}
