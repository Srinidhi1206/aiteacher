// Stage H: new route - no equivalent real strengths page existed before
// this. Mirrors app/(app)/weak-areas/page.tsx's structure for visual and
// architectural consistency; uses the existing StrengthProfile engine
// (lib/analytics/strengths.ts) via lib/actions/analytics.ts - no new
// analytics logic here.
import { Award } from "lucide-react";
import { Topbar } from "@/components/layout/topbar";
import { Card, CardContent } from "@/components/ui/card";
import { DatabaseUnavailable } from "@/components/database-unavailable";
import { StrengthsInfoBanner } from "@/components/strengths/info-banner";
import { StrengthsList } from "@/components/strengths/strengths-list";
import type { StrengthRow } from "@/components/strengths/strength-card";
import { getMyStrengths } from "@/lib/actions/analytics";

export default async function StrengthsPage() {
  let strengths: Awaited<ReturnType<typeof getMyStrengths>>;
  try {
    strengths = await getMyStrengths();
  } catch {
    return (
      <>
        <Topbar title="Strengths" />
        <main className="flex-1 p-4 sm:p-6">
          <DatabaseUnavailable what="Strengths analysis" />
        </main>
      </>
    );
  }

  const rows: StrengthRow[] = strengths.map((s) => ({
    id: s.id,
    topicId: s.topicId,
    topic: s.topic.name,
    chapter: s.topic.chapter.name,
    subject: s.topic.chapter.subject.name,
    mastery: s.mastery,
    reason: s.reason,
    trend: s.trend,
    trendHistory: Array.isArray(s.trendHistory) ? (s.trendHistory as number[]) : [],
    lastPracticed: s.lastPracticed,
  }));

  return (
    <>
      <Topbar title="Strengths" />
      <main className="flex-1 space-y-6 p-4 sm:p-6">
        <StrengthsInfoBanner />

        {rows.length === 0 ? (
          <Card className="flex min-h-[40vh] flex-col items-center justify-center text-center">
            <CardContent className="flex flex-col items-center gap-3 py-12">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-500">
                <Award className="h-7 w-7" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-gray-900 dark:text-gray-50">No strengths detected yet</h2>
                <p className="mt-1 max-w-sm text-sm text-gray-500 dark:text-gray-400">
                  Keep completing graded exams - a topic shows up here automatically once you consistently score 80%
                  or higher on it across at least 3 attempts.
                </p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <StrengthsList strengths={rows} />
        )}
      </main>
    </>
  );
}
