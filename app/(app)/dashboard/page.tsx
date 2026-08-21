import { Topbar } from "@/components/layout/topbar";
import { WelcomeBanner } from "@/components/dashboard/welcome-banner";
import { TaskListCard } from "@/components/dashboard/task-list-card";
import { ExamCountdownCard } from "@/components/dashboard/exam-countdown-card";
import { StudyPlanCard } from "@/components/dashboard/study-plan-card";
import { SubjectProgressCard } from "@/components/dashboard/subject-progress-card";
import { WeakStrongTopicsCard } from "@/components/dashboard/weak-strong-topics-card";
import { AssignmentsCard } from "@/components/dashboard/assignments-card";
import { PracticeTestsCard } from "@/components/dashboard/practice-tests-card";
import { RecentScoresCard } from "@/components/dashboard/recent-scores-card";
import { StreakCard } from "@/components/dashboard/streak-card";
import { BloomProgressCard } from "@/components/dashboard/bloom-progress-card";
import { RevisionAlertsCard } from "@/components/dashboard/revision-alerts-card";
import { NotificationsPanel } from "@/components/dashboard/notifications-panel";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { WeeklyProgressChart } from "@/components/charts/weekly-progress-chart";
import { MonthlyProgressChart } from "@/components/charts/monthly-progress-chart";
import { Heatmap } from "@/components/charts/heatmap";
import { RealDataSection } from "@/components/dashboard/real-data-section";

export default async function DashboardPage() {
  return (
    <>
      <Topbar title="Dashboard" />
      <main className="flex-1 space-y-6 p-4 sm:p-6">
        <WelcomeBanner />

        <RealDataSection />

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-6">
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              <TaskListCard />
              <ExamCountdownCard />
            </div>

            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Weekly Progress</CardTitle>
                </CardHeader>
                <CardContent>
                  <WeeklyProgressChart />
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Monthly Progress</CardTitle>
                </CardHeader>
                <CardContent>
                  <MonthlyProgressChart />
                </CardContent>
              </Card>
            </div>

            <BloomProgressCard />

            <WeakStrongTopicsCard />

            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              <AssignmentsCard />
              <PracticeTestsCard />
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Learning Heatmap</CardTitle>
              </CardHeader>
              <CardContent>
                <Heatmap />
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            <StreakCard />
            <SubjectProgressCard />
            <StudyPlanCard />
            <RecentScoresCard />
            <RevisionAlertsCard />
            <NotificationsPanel />
          </div>
        </div>
      </main>
    </>
  );
}
