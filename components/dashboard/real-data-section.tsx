// Stage E6: real, database-backed dashboard widgets (Today's Planner,
// Weak Areas, Strengths, Learning Path, Upcoming Exams, Recent Results),
// alongside (not replacing) the pre-existing mock-data widgets above/below
// this section on the dashboard. Every empty case shows an explicit
// message instead of fabricating data - see each card's fallback below.
//
// IMPORTANT: every query here needs a live database. Without one (the
// current state of this deployment), they'd throw and - since this
// section is embedded inside the existing dashboard page - crash the
// entire dashboard, including the previously-working mock widgets around
// it. The try/catch below is not decorative: it's what keeps this new,
// not-yet-connected section from regressing a page that worked before it
// was added. See docs/DATABASE.md.
import Link from "next/link";
import { AlertTriangle, Sparkles, TrendingUp, CalendarClock, Award, DatabaseZap } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { getCurrentSession } from "@/lib/auth/current-session";
import { getTodayOverview } from "@/lib/actions/planner";
import { getMyWeakAreas, getMyStrengths, getMyLearningPath } from "@/lib/actions/analytics";
import { listExamsForStudent, listResultsForStudent } from "@/lib/actions/exams";
import { RealPlannerTaskRow } from "./real-planner-task";
import { GenerateLearningPathButton } from "./generate-learning-path-button";

async function loadData() {
  const [overview, weakAreas, strengths, learningPath, exams, results] = await Promise.all([
    getTodayOverview(),
    getMyWeakAreas(),
    getMyStrengths(),
    getMyLearningPath(),
    listExamsForStudent(),
    listResultsForStudent(),
  ]);
  return { overview, weakAreas, strengths, learningPath, exams, results };
}

export async function RealDataSection() {
  const session = await getCurrentSession();
  if (!session || session.role !== "student") return null;

  let data: Awaited<ReturnType<typeof loadData>>;
  try {
    data = await loadData();
  } catch {
    return (
      <Card>
        <CardContent className="flex items-center gap-3 py-6">
          <DatabaseZap className="h-8 w-8 shrink-0 text-gray-300 dark:text-gray-600" />
          <div>
            <p className="text-sm font-medium text-gray-700 dark:text-gray-200">
              Live progress, exams, and planner data need a connected database.
            </p>
            <p className="text-xs text-gray-400">Once DATABASE_URL is set (see docs/DATABASE.md), this section activates automatically.</p>
          </div>
        </CardContent>
      </Card>
    );
  }
  const { overview, weakAreas, strengths, learningPath, exams, results } = data;

  const upcomingExams = exams.filter((e) => e.submissions.length === 0).slice(0, 3);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <div className="h-px flex-1 bg-gray-100 dark:bg-gray-800" />
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Live data (exams &amp; worksheets you&apos;ve completed)</p>
        <div className="h-px flex-1 bg-gray-100 dark:bg-gray-800" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Today's Planner */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarClock className="h-4 w-4 text-primary-500" /> Today&apos;s Planner
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {overview.tasks.length === 0 && !overview.planItem && overview.dueWorksheets.length === 0 ? (
              <p className="py-4 text-center text-sm text-gray-400">Nothing planned for today yet.</p>
            ) : (
              <>
                {overview.planItem && (
                  <RealPlannerTaskRow
                    id={overview.planItem.id}
                    title={overview.planItem.title}
                    subject={overview.planItem.subject}
                    done={overview.planItem.completed}
                  />
                )}
                {overview.tasks.map((t) => (
                  <RealPlannerTaskRow key={t.id} id={t.id} title={t.title} subject={t.subject} done={t.status === "COMPLETED"} />
                ))}
                {overview.dueWorksheets.map((w) => (
                  <div key={w.id} className="flex items-center gap-2.5 rounded-xl px-2 py-2 text-sm text-gray-600 dark:text-gray-300">
                    <Badge variant="warning">Due</Badge> {w.title} <span className="text-xs text-gray-400">- {w.subject.name}</span>
                  </div>
                ))}
              </>
            )}
          </CardContent>
        </Card>

        {/* Weak Areas */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-warning-500" /> Weak Areas
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {weakAreas.length === 0 ? (
              <p className="py-4 text-center text-sm text-gray-400">No weak areas detected yet. Complete a graded exam to see this.</p>
            ) : (
              weakAreas.slice(0, 4).map((w) => (
                <div key={w.id} className="rounded-xl border border-gray-100 p-2.5 dark:border-gray-800">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-gray-800 dark:text-gray-100">{w.topic.name}</p>
                    <span className="text-xs font-semibold text-warning-600 dark:text-warning-400">{w.mastery}%</span>
                  </div>
                  <p className="text-xs text-gray-400">{w.topic.chapter.subject.name}</p>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{w.reason}</p>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* Strengths */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-success-500" /> Strengths
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {strengths.length === 0 ? (
              <p className="py-4 text-center text-sm text-gray-400">No strengths identified yet. Keep completing exams to build this up.</p>
            ) : (
              strengths.slice(0, 4).map((s) => (
                <div key={s.id} className="rounded-xl border border-gray-100 p-2.5 dark:border-gray-800">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-gray-800 dark:text-gray-100">{s.topic.name}</p>
                    <span className="text-xs font-semibold text-success-600 dark:text-success-400">{s.mastery}%</span>
                  </div>
                  <p className="text-xs text-gray-400">{s.topic.chapter.subject.name}</p>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{s.reason}</p>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Learning Path */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary-500" /> Learning Path
            </CardTitle>
            <GenerateLearningPathButton />
          </CardHeader>
          <CardContent>
            {!learningPath || learningPath.items.length === 0 ? (
              <p className="py-4 text-center text-sm text-gray-400">
                No learning path yet. Click &quot;Generate my learning path&quot; to build one from your weak areas and upcoming exams.
              </p>
            ) : (
              <div className="space-y-2">
                {learningPath.items.slice(0, 6).map((item) => (
                  <div key={item.id} className="flex items-center justify-between rounded-xl border border-gray-100 p-2.5 text-sm dark:border-gray-800">
                    <div>
                      <span className="text-xs font-semibold text-gray-400">Day {item.day}</span>{" "}
                      <span className="text-gray-800 dark:text-gray-100">{item.title}</span>
                    </div>
                    <Badge variant={item.completed ? "success" : "outline"}>{item.completed ? "Done" : item.kind}</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Upcoming Exams + Recent Results */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Award className="h-4 w-4 text-primary-500" /> Exams &amp; Results
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-400">Upcoming</p>
              {upcomingExams.length === 0 ? (
                <p className="text-sm text-gray-400">No pending exams.</p>
              ) : (
                upcomingExams.map((e) => (
                  <Link key={e.id} href={`/exams/${e.id}/attempt`} className="flex items-center justify-between rounded-xl px-2 py-1.5 text-sm hover:bg-gray-50 dark:hover:bg-gray-800">
                    <span className="text-gray-800 dark:text-gray-100">{e.title}</span>
                    <span className="text-xs text-gray-400">{e.subject.name}</span>
                  </Link>
                ))
              )}
            </div>
            <div>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-400">Recent results</p>
              {results.length === 0 ? (
                <p className="text-sm text-gray-400">No assessment data yet. Complete your first worksheet or exam to start seeing progress.</p>
              ) : (
                results.slice(0, 3).map((r) => (
                  <Link key={r.examId} href={`/exams/${r.examId}/results`} className="flex items-center justify-between rounded-xl px-2 py-1.5 text-sm hover:bg-gray-50 dark:hover:bg-gray-800">
                    <span className="text-gray-800 dark:text-gray-100">{r.examTitle}</span>
                    {r.totalScore != null && r.maxScore ? (
                      <Progress value={Math.round((r.totalScore / r.maxScore) * 100)} size="sm" className="w-16" />
                    ) : (
                      <Badge variant="outline">Pending</Badge>
                    )}
                  </Link>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
