// Stage H: converted from the Step 1/2 mock page to real, persisted-data
// analytics. Async Server Component (matches the established real-data
// pattern - see components/dashboard/real-data-section.tsx) so a missing
// database degrades to DatabaseUnavailable instead of a blank/crashed page.
import { Topbar } from "@/components/layout/topbar";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { DatabaseUnavailable } from "@/components/database-unavailable";
import { StatGrid } from "@/components/performance/stat-grid";
import { SkillRadarChart } from "@/components/charts/skill-radar-chart";
import { SubjectPerformanceChart } from "@/components/charts/subject-performance-chart";
import { BloomProgressAllChart } from "@/components/charts/bloom-progress-all-chart";
import { Heatmap } from "@/components/charts/heatmap";
import { getMyOverallPerformance, getMyBloomPerformance, getMyActivityHeatmap, getMyProgress } from "@/lib/actions/analytics";
import type { PerformanceStat, SkillRadarPoint, SubjectPerformanceRow } from "@/lib/types";

async function loadData() {
  const [overall, bloom, heatmap, progress] = await Promise.all([
    getMyOverallPerformance(),
    getMyBloomPerformance(),
    getMyActivityHeatmap(),
    getMyProgress(),
  ]);
  return { overall, bloom, heatmap, progress };
}

export default async function PerformancePage() {
  let data: Awaited<ReturnType<typeof loadData>>;
  try {
    data = await loadData();
  } catch {
    return (
      <>
        <Topbar title="Performance" />
        <main className="flex-1 p-4 sm:p-6">
          <DatabaseUnavailable what="Performance analytics" />
        </main>
      </>
    );
  }

  const { overall, bloom, heatmap, progress } = data;
  const attemptedSubjects = progress.subjects.filter((s) => s.progress > 0);

  const stats: PerformanceStat[] = [
    {
      id: "overall",
      label: "Overall Percentage",
      value: overall.overallPercentage != null ? `${overall.overallPercentage}%` : "N/A",
      sublabel: overall.examsCompleted > 0 ? `Across ${overall.examsCompleted} graded exam${overall.examsCompleted === 1 ? "" : "s"}` : "No graded exams yet",
      trend: "flat",
      trendValue: overall.examsCompleted > 0 ? "From your graded exams" : "Not enough graded activity yet",
      icon: "Percent",
      accent: "primary",
    },
    {
      id: "attempted",
      label: "Exams Attempted",
      value: String(overall.examsAttempted),
      sublabel: `${overall.examsCompleted} completed`,
      trend: "flat",
      trendValue: "Total exams started",
      icon: "FileEdit",
      accent: "sky",
    },
    {
      id: "avg-score",
      label: "Average Score",
      value: overall.averageScorePct != null ? `${overall.averageScorePct}%` : "N/A",
      sublabel: "Average across graded exams",
      trend: "flat",
      trendValue: overall.averageScorePct != null ? "Average of each exam's score" : "Not enough graded activity yet",
      icon: "Gauge",
      accent: "success",
    },
    {
      id: "marks",
      label: "Total Marks",
      value: `${overall.totalMarksObtained}/${overall.totalMarksAvailable}`,
      sublabel: "Obtained vs available (graded exams)",
      trend: "flat",
      trendValue: "Sum across graded exams",
      icon: "Award",
      accent: "rose",
    },
    {
      id: "strongest",
      label: "Strongest Subject",
      value: overall.strongestSubject?.name ?? "N/A",
      sublabel: overall.strongestSubject ? `${overall.strongestSubject.averageScore}% average mastery` : "Not enough data yet",
      trend: "flat",
      trendValue: "Highest average mastery",
      icon: "TrendingUp",
      accent: "success",
    },
    {
      id: "weakest",
      label: "Weakest Subject",
      value: overall.weakestSubject?.name ?? "N/A",
      sublabel: overall.weakestSubject ? `${overall.weakestSubject.averageScore}% average mastery` : "Not enough data yet",
      trend: "flat",
      trendValue: "Lowest average mastery",
      icon: "TrendingDown",
      accent: "warning",
    },
  ];

  const radarData: SkillRadarPoint[] = attemptedSubjects.map((s) => ({
    skill: s.subject.name,
    subject: s.subject.name,
    value: s.averageScore,
    fullMark: 100,
  }));

  const subjectRows: SubjectPerformanceRow[] = attemptedSubjects.map((s) => ({
    subject: s.subject.name,
    color: s.subject.colorToken ?? "indigo",
    completion: s.progress,
    averageScore: s.averageScore,
  }));

  const bloomRows = bloom.filter((b) => b.percentage != null) as (typeof bloom[number] & { percentage: number })[];
  const bloomMissing = bloom.filter((b) => b.percentage == null);

  return (
    <>
      <Topbar title="Performance" />
      <main className="flex-1 space-y-6 p-4 sm:p-6">
        <StatGrid stats={stats} />

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Skill Radar</CardTitle>
              <CardDescription className="hidden sm:block">Average mastery per subject you&apos;ve attempted</CardDescription>
            </CardHeader>
            <CardContent>
              {radarData.length >= 3 ? (
                <SkillRadarChart data={radarData} />
              ) : (
                <p className="py-10 text-center text-sm text-gray-400">
                  Not enough subjects with graded activity yet - attempt exams in at least 3 subjects to see a radar view.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Subject-wise Progress</CardTitle>
              <CardDescription className="hidden sm:block">Completion vs average score, per subject</CardDescription>
            </CardHeader>
            <CardContent>
              {subjectRows.length > 0 ? (
                <>
                  <SubjectPerformanceChart data={subjectRows} />
                  <div className="mt-2 flex items-center gap-4 text-xs text-gray-400">
                    <span className="flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-gray-300 dark:bg-gray-600" aria-hidden /> Completion
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-primary-500" aria-hidden /> Average Score
                    </span>
                  </div>
                </>
              ) : (
                <p className="py-10 text-center text-sm text-gray-400">No subject progress yet - attempt a graded exam to see this.</p>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Performance by Topic Bloom Level</CardTitle>
            <CardDescription className="hidden sm:block">
              Based on each answered question&apos;s topic classification (Remember -&gt; Understand -&gt; Apply -&gt; Analyze), not an
              individually-classified question
            </CardDescription>
          </CardHeader>
          <CardContent>
            {bloomRows.length > 0 ? (
              <BloomProgressAllChart data={bloomRows} />
            ) : (
              <p className="py-10 text-center text-sm text-gray-400">Not enough graded, topic-tagged answers yet to break down by Bloom level.</p>
            )}
            {bloomMissing.length > 0 && bloomRows.length > 0 && (
              <p className="mt-2 text-xs text-gray-400">
                Not enough data yet for: {bloomMissing.map((b) => b.bloomLevel.charAt(0) + b.bloomLevel.slice(1).toLowerCase()).join(", ")}.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Activity Heatmap</CardTitle>
            <CardDescription className="hidden sm:block">12 weeks of exam submissions, worksheet submissions, and completed planner tasks</CardDescription>
          </CardHeader>
          <CardContent>
            <Heatmap data={heatmap.days} />
            {!heatmap.hasAnyActivity && <p className="mt-3 text-sm text-gray-400">No activity recorded in the last 12 weeks.</p>}
          </CardContent>
        </Card>
      </main>
    </>
  );
}
