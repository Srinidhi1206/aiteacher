"use client";
import { CheckCircle2, XCircle } from "lucide-react";
import { LessonQuestion } from "@/lib/types";
import { cn } from "@/lib/utils";

export function LessonQuestionCard({
  question,
  value,
  onChange,
  disabled,
  revealCorrectness,
}: {
  question: LessonQuestion;
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
  revealCorrectness: "correct" | "incorrect" | null;
}) {
  if (question.type === "mcq" || question.type === "true-false") {
    const options = question.type === "true-false" ? ["True", "False"] : question.options ?? [];
    return (
      <div className={cn("grid gap-2", question.type === "true-false" ? "grid-cols-2" : "grid-cols-1")}>
        {options.map((opt) => {
          const isSelected = value === opt;
          const isCorrectOpt = opt.toLowerCase() === question.correctAnswer.trim().toLowerCase();
          const showState = disabled && (isSelected || (revealCorrectness && isCorrectOpt));
          return (
            <button
              key={opt}
              type="button"
              disabled={disabled}
              onClick={() => onChange(opt)}
              className={cn(
                "flex items-center justify-between gap-2 rounded-xl border px-4 py-2.5 text-left text-sm font-medium transition-colors",
                "disabled:cursor-not-allowed",
                showState && revealCorrectness === "correct" && isSelected
                  ? "border-success-300 bg-success-50 text-success-700 dark:border-success-800 dark:bg-success-900/20 dark:text-success-400"
                  : showState && revealCorrectness === "incorrect" && isSelected
                  ? "border-red-300 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-900/20 dark:text-red-400"
                  : showState && isCorrectOpt
                  ? "border-success-300 bg-success-50 text-success-700 dark:border-success-800 dark:bg-success-900/20 dark:text-success-400"
                  : isSelected
                  ? "border-primary-400 bg-primary-50 text-primary-700 dark:border-primary-700 dark:bg-primary-950 dark:text-primary-300"
                  : "border-gray-200 text-gray-700 hover:border-primary-200 dark:border-gray-700 dark:text-gray-200"
              )}
            >
              {opt}
              {showState && isSelected && revealCorrectness === "correct" && <CheckCircle2 className="h-4 w-4" />}
              {showState && isSelected && revealCorrectness === "incorrect" && <XCircle className="h-4 w-4" />}
            </button>
          );
        })}
      </div>
    );
  }

  if (question.type === "fill-blank") {
    return (
      <input
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Type your answer..."
        className="w-full rounded-xl border border-gray-200 bg-transparent px-4 py-2.5 text-sm text-gray-800 outline-none focus:border-primary-400 disabled:opacity-70 dark:border-gray-700 dark:text-gray-100"
      />
    );
  }

  // short-answer
  return (
    <textarea
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      placeholder="Explain your reasoning..."
      rows={4}
      className="w-full rounded-xl border border-gray-200 bg-transparent px-4 py-2.5 text-sm text-gray-800 outline-none focus:border-primary-400 disabled:opacity-70 dark:border-gray-700 dark:text-gray-100"
    />
  );
}
