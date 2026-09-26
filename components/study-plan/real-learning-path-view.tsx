"use client";
// Real, database-backed "My Plan" - reuses the same Learning Path engine
// (getMyLearningPath/regenerateMyLearningPath/completeLearningPathItem,
// lib/actions/analytics.ts) already wired into the dashboard's
// RealDataSection, just rendered in full here (every day, not truncated)
// with a working "mark complete" control per item.
import * as React from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Check, Loader2 } from "lucide-react";
import Link from "next/link";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { GenerateLearningPathButton } from "@/components/dashboard/generate-learning-path-button";
import { completeLearningPathItem, getMyLearningPath, getMyWeakAreas } from "@/lib/actions/analytics";
import { cn } from "@/lib/utils";

type LearningPath = Awaited<ReturnType<typeof getMyLearningPath>>;
type WeakAreas = Awaited<ReturnType<typeof getMyWeakAreas>>;

const KIND_LABEL: Record<string, string> = {
  TOPIC: "Topic",
  REVISION: "Revision",
  PRACTICE: "Practice",
  MOCK_TEST: "Mock Test",
  BUFFER: "Buffer",
};

export function RealLearningPathView({ learningPath, weakAreas }: { learningPath: LearningPath | null; weakAreas: WeakAreas }) {
  const router = useRouter();
  const [pendingId, setPendingId] = React.useState<string | null>(null);

  const items = learningPath?.items ?? [];
  const completed = items.filter((i) => i.completed).length;
  const completionPct = items.length > 0 ? Math.round((completed / items.length) * 100) : null;
  const weakTopicsCovered = weakAreas.filter((w) => items.some((i) => i.title.includes(w.topic.name))).length;

  async function toggleItem(itemId: string, next: boolean) {
    setPendingId(itemId);
    await completeLearningPathItem(itemId, next);
    setPendingId(null);
    router.refresh();
  }

  if (items.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary-500" /> My Plan
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
          <p className="max-w-sm text-sm text-gray-500 dark:text-gray-400">
            No learning path yet. It&apos;s generated from your weak areas and upcoming exams - complete a graded exam first, or
            generate a general plan now.
          </p>
          <GenerateLearningPathButton />
        </CardContent>
      </Card>
    );
  }

  const days = Array.from(new Set(items.map((i) => i.day))).sort((a, b) => a - b);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary-500" /> My Plan
        </CardTitle>
        <GenerateLearningPathButton />
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
          <span className="font-semibold text-gray-700 dark:text-gray-200">{completionPct}% complete</span>
          <span>
            {completed}/{items.length} items done
          </span>
          {weakAreas.length > 0 && (
            <span>
              {weakTopicsCovered}/{weakAreas.length} weak topics covered
            </span>
          )}
        </div>

        <div className="space-y-5">
          {days.map((day) => {
            const dayItems = items.filter((i) => i.day === day);
            return (
              <div key={day}>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
                  Day {day} - {new Date(dayItems[0].date).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                </p>
                <div className="space-y-2">
                  {dayItems.map((item) => (
                    <div
                      key={item.id}
                      className={cn(
                        "flex items-center justify-between gap-3 rounded-xl border p-3 text-sm",
                        item.completed ? "border-success-100 bg-success-50 dark:border-success-900/40 dark:bg-success-900/10" : "border-gray-100 dark:border-gray-800"
                      )}
                    >
                      <div className="flex min-w-0 items-start gap-3">
                        <button
                          onClick={() => toggleItem(item.id, !item.completed)}
                          disabled={pendingId === item.id}
                          aria-label={item.completed ? "Mark incomplete" : "Mark complete"}
                          className={cn(
                            "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors",
                            item.completed
                              ? "border-success-500 bg-success-500 text-white"
                              : "border-gray-300 text-transparent hover:border-primary-400 dark:border-gray-600"
                          )}
                        >
                          {pendingId === item.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                        </button>
                        <div className="min-w-0">
                          <p className={cn("truncate font-medium text-gray-800 dark:text-gray-100", item.completed && "line-through opacity-60")}>
                            {item.title}
                          </p>
                          <div className="mt-0.5 flex items-center gap-1.5">
                            <Badge variant="default" className="text-[10px]">
                              {KIND_LABEL[item.kind] ?? item.kind}
                            </Badge>
                            <span className="text-xs text-gray-400">{item.subject}</span>
                            <span className="text-xs text-gray-400">- {item.durationMinutes} min</span>
                          </div>
                        </div>
                      </div>
                      <Link
                        href={`/ai-tutor?prefill=${encodeURIComponent(`Help me with: ${item.title} (${item.subject}).`)}`}
                        className="flex shrink-0 items-center gap-1 text-xs font-medium text-primary-600 hover:underline dark:text-primary-400"
                      >
                        <Sparkles className="h-3 w-3" /> Ask Tutor
                      </Link>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
