import Link from "next/link";
import { Award, Brain, Lightbulb, Search, Wrench, Zap } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

export interface BloomResult {
  correct: number;
  total: number;
  xp: number;
}

const levelMeta = [
  { level: 1, label: "Remember", icon: Brain },
  { level: 2, label: "Understand", icon: Lightbulb },
  { level: 3, label: "Apply", icon: Wrench },
  { level: 4, label: "Analyze", icon: Search },
] as const;

export function LessonSummary({
  results,
  xpEarned,
  topicName,
  subjectSlug,
  topicSlug,
}: {
  results: Record<number, BloomResult>;
  xpEarned: number;
  topicName: string;
  subjectSlug: string;
  topicSlug: string;
}) {
  const totalCorrect = Object.values(results).reduce((s, r) => s + r.correct, 0);
  const totalQuestions = Object.values(results).reduce((s, r) => s + r.total, 0);

  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-5 p-8 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-success-100 text-success-600 dark:bg-success-900/30 dark:text-success-400">
          <Award className="h-8 w-8" />
        </div>
        <div>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-50">Lesson Complete!</h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            You worked through all four levels of {topicName}. Here&apos;s how it went.
          </p>
        </div>

        <div className="flex items-center gap-2 rounded-2xl bg-primary-50 px-5 py-3 text-primary-700 dark:bg-primary-950 dark:text-primary-300">
          <Zap className="h-5 w-5" />
          <span className="text-lg font-bold">+{xpEarned} XP earned</span>
        </div>

        <p className="text-sm text-gray-500 dark:text-gray-400">
          Overall: <span className="font-semibold text-gray-800 dark:text-gray-100">{totalCorrect}</span> / {totalQuestions} correct
        </p>

        <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2">
          {levelMeta.map(({ level, label, icon: Icon }) => {
            const r = results[level];
            if (!r || r.total === 0) return null;
            const pct = Math.round((r.correct / r.total) * 100);
            return (
              <div key={level} className="rounded-2xl border border-gray-100 p-4 text-left dark:border-gray-800">
                <div className="mb-2 flex items-center gap-2">
                  <Icon className="h-4 w-4 text-primary-500" />
                  <span className="text-sm font-semibold text-gray-800 dark:text-gray-100">{label}</span>
                  <span className="ml-auto text-xs font-semibold text-gray-500">
                    {r.correct}/{r.total}
                  </span>
                </div>
                <Progress value={pct} size="sm" />
                <p className="mt-1.5 text-xs text-gray-400">+{r.xp} XP</p>
              </div>
            );
          })}
        </div>

        <div className="flex flex-wrap justify-center gap-3 pt-2">
          <Link
            href={`/subjects/${subjectSlug}/${topicSlug}`}
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-gray-200 px-4 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
          >
            Back to Topic
          </Link>
          <Link
            href={`/subjects/${subjectSlug}`}
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary-600 px-4 text-sm font-medium text-white hover:bg-primary-700"
          >
            Continue to Next Topic
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
