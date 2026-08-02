import { Topbar } from "@/components/layout/topbar";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChildOverviewCard } from "@/components/parent/child-overview-card";
import { StudyTimeChart } from "@/components/parent/study-time-chart";
import { RecommendationsCard } from "@/components/parent/recommendations-card";
import { ExamCountdownCard } from "@/components/dashboard/exam-countdown-card";
import { AssignmentsCard } from "@/components/dashboard/assignments-card";
import { MonthlyProgressChart } from "@/components/charts/monthly-progress-chart";
import { weakConcepts } from "@/lib/mock-data/weak-areas";

export default function ParentDashboardPage() {
  const topWeak = weakConcepts.slice(0, 5);

  return (
    <>
      <Topbar title="Parent View" />
      <main className="flex-1 space-y-6 p-4 sm:p-6">
        <ChildOverviewCard />

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Performance Trend</CardTitle>
                <CardDescription className="hidden sm:block">Average score and hours studied, last 6 months</CardDescription>
              </CardHeader>
              <CardContent>
                <MonthlyProgressChart />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Weekly Study Time</CardTitle>
              </CardHeader>
              <CardContent>
                <StudyTimeChart />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Current Weaknesses</CardTitle>
                <CardDescription className="hidden sm:block">Topics that need more practice right now</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {topWeak.map((wc) => (
                  <div key={wc.id} className="flex items-center justify-between gap-2 rounded-xl border border-gray-100 p-3 dark:border-gray-800">
                    <div>
                      <p className="text-sm font-medium text-gray-800 dark:text-gray-100">{wc.topic}</p>
                      <p className="text-xs text-gray-400">{wc.subject} - {wc.reason}</p>
                    </div>
                    <Badge variant="warning" className="shrink-0">{wc.mastery}% mastery</Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            <ExamCountdownCard />
            <AssignmentsCard />
            <RecommendationsCard />
          </div>
        </div>
      </main>
    </>
  );
}
