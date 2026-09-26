// The student dashboard: everything on it is the student's real data
// (planner, weak areas, strengths, learning path, exams and results - see
// components/dashboard/real-data-section.tsx). The old sample cards (fake
// streaks, assignments, exam countdowns, charts) were removed.
import { Topbar } from "@/components/layout/topbar";
import { WelcomeBanner } from "@/components/dashboard/welcome-banner";
import { RealDataSection } from "@/components/dashboard/real-data-section";

export default async function DashboardPage() {
  return (
    <>
      <Topbar title="Dashboard" />
      <main className="flex-1 space-y-6 p-4 sm:p-6">
        <WelcomeBanner />
        <RealDataSection />
      </main>
    </>
  );
}
