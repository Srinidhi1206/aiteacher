import { Topbar } from "@/components/layout/topbar";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { StatGrid } from "@/components/performance/stat-grid";
import { SkillRadarChart } from "@/components/charts/skill-radar-chart";
import { SubjectPerformanceChart } from "@/components/charts/subject-performance-chart";
import { BloomProgressAllChart } from "@/components/charts/bloom-progress-all-chart";
import { Heatmap } from "@/components/charts/heatmap";

export default function PerformancePage() {
  return (
    <>
      <Topbar title="Performance" />
      <main className="flex-1 space-y-6 p-4 sm:p-6">
        <StatGrid />

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Skill Radar</CardTitle>
              <CardDescription className="hidden sm:block">Mastery across every subject</CardDescription>
            </CardHeader>
            <CardContent>
              <SkillRadarChart />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Subject-wise Progress</CardTitle>
              <CardDescription className="hidden sm:block">Completion vs average score</CardDescription>
            </CardHeader>
            <CardContent>
              <SubjectPerformanceChart />
              <div className="mt-2 flex items-center gap-4 text-xs text-gray-400">
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-gray-300 dark:bg-gray-600" /> Completion
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-primary-500" /> Average Score
                </span>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Bloom Level Progress - All Subjects</CardTitle>
            <CardDescription className="hidden sm:block">
              Remember -&gt; Understand -&gt; Apply -&gt; Analyze mastery, per subject
            </CardDescription>
          </CardHeader>
          <CardContent>
            <BloomProgressAllChart />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Learning Heatmap</CardTitle>
            <CardDescription className="hidden sm:block">12 weeks of study activity</CardDescription>
          </CardHeader>
          <CardContent>
            <Heatmap />
          </CardContent>
        </Card>
      </main>
    </>
  );
}
