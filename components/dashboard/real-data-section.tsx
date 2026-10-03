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
import { getTodayOverview, getPlannerAnalytics } from "@/lib/actions/planner";
import { getMyWeakAreas, getMyStrengths, getMyLearningPath } from "@/lib/actions/analytics";
import { listExamsForStudent, listResultsForStudent } from "@/lib/actions/exams";
import { RealPlannerTaskRow } from "./real-planner-task";
import { GenerateLearningPathButton } from "./generate-learning-path-button";

async function loadData() {
  const [overview, plannerStats, weakAreas, strengths, learningPath, exams, results] = await Promise.all([
    getTodayOverview(),
    getPlannerAnalytics(),
    getMyWeakAreas(),
    getMyStrengths(),
    getMyLearningPath(),
    listExamsForStudent(),
    listResultsForStudent(),
  ]);
  return { overview, plannerStats, weakAreas, strengths, learningPath, exams, results };
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
            <p className="text-sm font-medium text-gray-700 dark:text-gray-200">Your progress, exams and planner couldn&apos;t be loaded right now.</p>
            <p className="text-xs text-gray-400">This is usually temporary - refresh the page in a moment.</p>
          </div>
        </CardContent>
      </Card>
    );
  }
  const { overview, plannerStats, weakAreas, strengths, learningPath, exams, results } = data;

  const upcomingExams = exams.filter((e) => e.submissions.length === 0).slice(0, 3);

  // Learning-path analytics (H11): presentation-only aggregation over data
  // already fetched above - no recomputation of the plan-generation logic
  // itself (that stays entirely in lib/analytics/learning-path.ts).
  const pathItems = learningPath?.items ?? [];
  const pathCompleted = pathItems.filter((i) => i.completed).length;
  const pathCompletionPct = pathItems.length > 0 ? Math.round((pathCompleted / pathItems.length) * 100) : null;
  const pathRemaining = pathItems.length - pathCompleted;
  const weakTopicsCovered = weakAreas.filter((w) => pathItems.some((i) => i.title.includes(w.topic.name))).length;
  const nextItem = pathItems.find((i) => !i.completed) ?? null;

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
          {plannerStats.today.total > 0 && (
            <div className="flex items-center gap-3 border-b border-gray-100 px-4 py-2 text-xs text-gray-500 dark:border-gray-800 dark:text-gray-400">
              <span className="font-semibold text-gray-700 dark:text-gray-200">{plannerStats.today.completionPct}% today</span>
              <span>{plannerStats.today.completed}/{plannerStats.today.total} done</span>
              {plannerStats.today.skipped > 0 && <span>{plannerStats.today.skipped} skipped</span>}
              <span className="ml-auto">
                {plannerStats.week.completionPct != null ? `${plannerStats.week.completionPct}% this week` : "No tasks this week"}
              </span>
            </div>
          )}
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
                  <Link
                    href={`/ai-tutor?topicId=${w.topicId}&prefill=${encodeURIComponent(`Help me improve in ${w.topic.name}. Explain the concept first, then give me 3 practice questions.`)}`}
                    className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-primary-600 hover:underline dark:text-primary-400"
                  >
                    <Sparkles className="h-3 w-3" /> Ask Tutor
                  </Link>
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
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
                  <span className="font-semibold text-gray-700 dark:text-gray-200">{pathCompletionPct}% complete</span>
                  <span>{pathCompleted}/{pathItems.length} items done</span>
                  <span>{pathRemaining} remaining</span>
                  {weakAreas.length > 0 && (
                    <span>
                      {weakTopicsCovered}/{weakAreas.length} weak topics covered
                    </span>
                  )}
                </div>
                {nextItem && (
                  <div className="flex items-center justify-between gap-2 rounded-xl bg-primary-50 px-2.5 py-2 text-xs dark:bg-primary-950/40">
                    <span className="text-primary-800 dark:text-primary-300">
                      <span className="font-semibold">Next up:</span> Day {nextItem.day} - {nextItem.title}
                    </span>
                  </div>
                )}
                <div className="space-y-2">
                {learningPath.items.slice(0, 6).map((item) => (
                  <div key={item.id} className="flex items-center justify-between gap-2 rounded-xl border border-gray-100 p-2.5 text-sm dark:border-gray-800">
                    <div className="min-w-0">
                      <span className="text-xs font-semibold text-gray-400">Day {item.day}</span>{" "}
                      <span className="text-gray-800 dark:text-gray-100">{item.title}</span>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Link
                        href={`/ai-tutor?prefill=${encodeURIComponent(`Help me with: ${item.title} (${item.subject}).`)}`}
                        className="flex items-center gap-1 text-xs font-medium text-primary-600 hover:underline dark:text-primary-400"
                      >
                        <Sparkles className="h-3 w-3" /> Ask Tutor
                      </Link>
                      <Badge variant={item.completed ? "success" : "outline"}>{item.completed ? "Done" : item.kind}</Badge>
                    </div>
                  </div>
                ))}
                </div>
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
