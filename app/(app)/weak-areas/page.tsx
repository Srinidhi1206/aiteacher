// Stage H: converted from mock (lib/mock-data/weak-areas.ts) to the real
// weakness engine (lib/analytics/weakness.ts via lib/actions/analytics.ts).
import { Target } from "lucide-react";
import { Topbar } from "@/components/layout/topbar";
import { Card, CardContent } from "@/components/ui/card";
import { DatabaseUnavailable } from "@/components/database-unavailable";
import { DetectionBanner } from "@/components/weak-areas/detection-banner";
import { WeakAreasList } from "@/components/weak-areas/weak-areas-list";
import type { WeakConceptRow } from "@/components/weak-areas/weak-concept-card";
import { getMyWeakAreas } from "@/lib/actions/analytics";

export default async function WeakAreasPage() {
  let weakAreas: Awaited<ReturnType<typeof getMyWeakAreas>>;
  try {
    weakAreas = await getMyWeakAreas();
  } catch {
    return (
      <>
        <Topbar title="Weak Areas" />
        <main className="flex-1 p-4 sm:p-6">
          <DatabaseUnavailable what="Weak-area analysis" />
        </main>
      </>
    );
  }

  const concepts: WeakConceptRow[] = weakAreas.map((w) => ({
    id: w.id,
    topicId: w.topicId,
    topic: w.topic.name,
    chapter: w.topic.chapter.name,
    subject: w.topic.chapter.subject.name,
    mastery: w.mastery,
    reason: w.reason,
    wrongAnswers: w.wrongAnswers,
    totalAttempts: w.totalAttempts,
    trend: w.trend,
    trendHistory: Array.isArray(w.trendHistory) ? (w.trendHistory as number[]) : [],
    lastPracticed: w.lastPracticed,
  }));

  return (
    <>
      <Topbar title="Weak Areas" />
      <main className="flex-1 space-y-6 p-4 sm:p-6">
        <DetectionBanner />

        {concepts.length === 0 ? (
          <Card className="flex min-h-[40vh] flex-col items-center justify-center text-center">
            <CardContent className="flex flex-col items-center gap-3 py-12">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-500">
                <Target className="h-7 w-7" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-gray-900 dark:text-gray-50">No weak areas detected</h2>
                <p className="mt-1 max-w-sm text-sm text-gray-500 dark:text-gray-400">
                  Either you haven&apos;t completed enough graded exams yet, or your mastery is holding above 50% on
                  everything so far. Keep taking graded exams - topics will show here automatically if they need
                  attention.
                </p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <WeakAreasList concepts={concepts} />
        )}
      </main>
    </>
  );
}
