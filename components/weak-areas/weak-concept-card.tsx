"use client";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { MiniTrend } from "@/components/weak-areas/mini-trend";
import { useToast } from "@/components/ui/toast";
import { formatDate, cn } from "@/lib/utils";
import type { WeakConcept } from "@/lib/types";

export function WeakConceptCard({ concept }: { concept: WeakConcept }) {
  const { showToast } = useToast();

  const topicHref =
    concept.relatedSubjectSlug && concept.relatedTopicSlug
      ? `/subjects/${concept.relatedSubjectSlug}/${concept.relatedTopicSlug}`
      : "/subjects";

  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-xs text-gray-400">{concept.chapter}</p>
            <p className="text-sm font-semibold text-gray-900 dark:text-gray-50">{concept.topic}</p>
          </div>
          <Badge variant="warning">{concept.bloomLevel}</Badge>
        </div>

        <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">{concept.reason}</p>

        <div className="mt-3 flex items-center justify-between text-xs text-gray-400">
          <span>
            {concept.wrongAnswers}/{concept.totalAttempts} wrong - last practiced {formatDate(concept.lastPracticed)}
          </span>
          <MiniTrend concept={concept} />
        </div>

        <div className="mt-2 flex items-center gap-2">
          <Progress value={concept.mastery} size="sm" className="flex-1" />
          <span className="text-xs font-semibold text-gray-500">{concept.mastery}%</span>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="primary"
            onClick={() =>
              showToast(
                `Targeted assignment created for ${concept.topic}`,
                "You'll find it in Assignments, focused on this topic and Bloom level."
              )
            }
          >
            Start Targeted Assignment
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              showToast(`${concept.topic} added to your revision plan`, "It will appear as a revision task in Study Plan.")
            }
          >
            Add to Revision Plan
          </Button>
          <Link
            href={topicHref}
            className={cn(
              "inline-flex h-8 items-center justify-center rounded-xl px-3 text-sm font-medium text-gray-600 transition-colors duration-150 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
            )}
          >
            Retake Mini Test
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
