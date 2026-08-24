import { AlertTriangle } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import type { TopicDifficultyRow } from "@/lib/actions/teacher-analytics";

export function ClassWeakConceptsCard({ topics }: { topics: TopicDifficultyRow[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-warning-500" /> Class-wide Topic Difficulty
        </CardTitle>
        <CardDescription className="hidden sm:block">Topics students in this class consistently get wrong, from your own exams</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {topics.length === 0 ? (
          <p className="py-6 text-center text-sm text-gray-400">Not enough graded, topic-tagged answers yet to identify difficult topics.</p>
        ) : (
          topics.map((t) => (
            <div key={t.topicId} className="rounded-xl border border-gray-100 p-3 dark:border-gray-800">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-medium text-gray-800 dark:text-gray-100">{t.topicName}</p>
                  <p className="text-xs text-gray-400">{t.chapterName}</p>
                </div>
                <Badge variant="warning" className="shrink-0">
                  {t.studentCount} student{t.studentCount === 1 ? "" : "s"}
                </Badge>
              </div>
              <Progress value={t.strugglingPct} size="sm" className="mt-2" />
              <p className="mt-1 text-xs text-gray-400">{t.strugglingPct}% of answers below full marks ({t.answerCount} answers)</p>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
