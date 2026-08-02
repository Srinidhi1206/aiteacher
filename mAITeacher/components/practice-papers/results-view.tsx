"use client";
import type { ComponentType } from "react";
import Link from "next/link";
import { AlertTriangle, Clock, Percent, Target } from "lucide-react";
import { AttemptResult } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TopicRadarChart, BloomBarChart } from "@/components/practice-papers/results-charts";
import { QuestionReviewCard } from "@/components/practice-papers/question-review-card";

function StatCard({ icon: Icon, label, value, sub }: { icon: ComponentType<{ className?: string }>; label: string; value: string; sub?: string }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-600 dark:bg-primary-950 dark:text-primary-300">
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-xs text-gray-400">{label}</p>
          <p className="text-lg font-bold text-gray-900 dark:text-gray-50">{value}</p>
          {sub && <p className="text-[11px] text-gray-400">{sub}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

export function ResultsView({ result }: { result: AttemptResult }) {
  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex flex-col items-center gap-2 p-6 text-center">
          <p className="text-xs font-medium text-gray-400">{result.paperTitle}</p>
          <p className="text-4xl font-bold text-gray-900 dark:text-gray-50">
            {result.scoreObtained}
            <span className="text-lg font-medium text-gray-400"> / {result.totalMarks}</span>
          </p>
          <Badge variant={result.accuracy >= 75 ? "success" : result.accuracy >= 50 ? "warning" : "danger"}>{result.accuracy}% accuracy</Badge>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard icon={Percent} label="Accuracy" value={`${result.accuracy}%`} />
        <StatCard icon={Target} label="Concept Understanding" value={`${result.conceptUnderstanding}%`} sub="Apply + Analyze levels" />
        <StatCard icon={Clock} label="Time Taken" value={`${result.timeTakenMinutes} min`} />
        <StatCard icon={AlertTriangle} label="Weak Concepts" value={`${result.weakConcepts.length}`} sub="topics flagged" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Performance by Topic</CardTitle>
          </CardHeader>
          <CardContent>
            <TopicRadarChart topicBreakdown={result.topicBreakdown} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Performance by Bloom Level</CardTitle>
          </CardHeader>
          <CardContent>
            <BloomBarChart bloomBreakdown={result.bloomBreakdown} />
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Weak Concepts</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-1.5">
            {result.weakConcepts.length ? (
              result.weakConcepts.map((c) => (
                <Badge key={c} variant="warning">
                  {c}
                </Badge>
              ))
            ) : (
              <p className="text-sm text-gray-400">No weak concepts identified.</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Missing Knowledge</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1.5">
              {result.missingKnowledge.map((m, i) => (
                <li key={i} className="text-xs text-gray-600 dark:text-gray-300">
                  - {m}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Common Errors</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1.5">
              {result.commonErrors.map((m, i) => (
                <li key={i} className="text-xs text-gray-600 dark:text-gray-300">
                  - {m}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Question-by-Question Review</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {result.perQuestion.map((q, i) => (
            <QuestionReviewCard key={q.questionId} result={q} index={i} />
          ))}
        </CardContent>
      </Card>

      <div className="flex justify-center pb-4">
        <Link href="/practice-papers" className="text-sm font-medium text-primary-600 hover:underline dark:text-primary-400">
          Back to Practice Papers
        </Link>
      </div>
    </div>
  );
}
