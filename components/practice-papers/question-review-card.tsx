import { CheckCircle2, XCircle } from "lucide-react";
import { AttemptQuestionResult } from "@/lib/types";
import { Badge } from "@/components/ui/badge";

const bloomLabels: Record<number, string> = { 1: "Remember", 2: "Understand", 3: "Apply", 4: "Analyze" };

export function QuestionReviewCard({ result, index }: { result: AttemptQuestionResult; index: number }) {
  return (
    <div className="rounded-2xl border border-gray-100 p-4 dark:border-gray-800">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-gray-900 dark:text-gray-50">Q{index + 1}.</span>
          <Badge variant="outline">{result.topic}</Badge>
          <Badge variant="default">{bloomLabels[result.bloomLevel]}</Badge>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-gray-400">
            {result.marksAwarded}/{result.marks} marks
          </span>
          {result.isCorrect ? (
            <CheckCircle2 className="h-4 w-4 text-success-500" />
          ) : (
            <XCircle className="h-4 w-4 text-red-500" />
          )}
        </div>
      </div>

      <p className="mt-2 text-sm text-gray-700 dark:text-gray-300">{result.prompt}</p>

      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div className="rounded-xl bg-gray-50 p-3 dark:bg-gray-800/50">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Your Answer</p>
          <p className="mt-1 text-sm text-gray-700 dark:text-gray-300">{result.studentAnswer}</p>
        </div>
        <div className="rounded-xl bg-success-50 p-3 dark:bg-success-900/10">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-success-600 dark:text-success-400">Correct Answer</p>
          <p className="mt-1 text-sm text-success-800 dark:text-success-300">{result.correctAnswer}</p>
        </div>
      </div>

      <div className="mt-2 rounded-xl bg-primary-50/60 p-3 dark:bg-primary-950/20">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-primary-600 dark:text-primary-400">Explanation</p>
        <p className="mt-1 text-sm text-primary-900/90 dark:text-primary-200/90">{result.explanation}</p>
      </div>

      {!result.isCorrect && (
        <div className="mt-2 rounded-xl bg-warning-50 p-3 dark:bg-warning-900/10">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-warning-700 dark:text-warning-400">Improvement Tip</p>
          <p className="mt-1 text-sm text-warning-800/90 dark:text-warning-300/90">{result.improvementTip}</p>
        </div>
      )}
    </div>
  );
}
