"use client";
import { Waypoints } from "lucide-react";
import { PaperQuestion } from "@/lib/types";
import { cn } from "@/lib/utils";

export function QuestionRenderer({
  question,
  value,
  onChange,
}: {
  question: PaperQuestion;
  value: string;
  onChange: (v: string) => void;
}) {
  if (question.type === "case-study") {
    return (
      <div className="space-y-3">
        <blockquote className="rounded-2xl bg-gray-50 p-4 text-sm italic text-gray-600 dark:bg-gray-800/50 dark:text-gray-300">
          {question.scenario}
        </blockquote>
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={5}
          placeholder="Write your response to the case study..."
          className="w-full rounded-xl border border-gray-200 bg-transparent px-4 py-2.5 text-sm text-gray-800 outline-none focus:border-primary-400 dark:border-gray-700 dark:text-gray-100"
        />
      </div>
    );
  }

  if (question.type === "diagram") {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-3 rounded-2xl border border-dashed border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800/50">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-white text-primary-600 shadow-soft dark:bg-gray-900 dark:text-primary-400">
            <Waypoints className="h-7 w-7" />
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400">{question.diagramCaption}</p>
        </div>
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={4}
          placeholder="Label/describe the diagram and write your answer..."
          className="w-full rounded-xl border border-gray-200 bg-transparent px-4 py-2.5 text-sm text-gray-800 outline-none focus:border-primary-400 dark:border-gray-700 dark:text-gray-100"
        />
      </div>
    );
  }

  if (question.type === "mcq") {
    return (
      <div className="space-y-2">
        {(question.options ?? []).map((opt) => (
          <label
            key={opt}
            className={cn(
              "flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-2.5 text-sm transition-colors",
              value === opt
                ? "border-primary-400 bg-primary-50 text-primary-700 dark:border-primary-700 dark:bg-primary-950 dark:text-primary-300"
                : "border-gray-200 text-gray-700 hover:border-primary-200 dark:border-gray-700 dark:text-gray-200"
            )}
          >
            <input type="radio" className="accent-primary-600" checked={value === opt} onChange={() => onChange(opt)} />
            {opt}
          </label>
        ))}
      </div>
    );
  }

  if (question.type === "true-false") {
    return (
      <div className="grid grid-cols-2 gap-3">
        {["True", "False"].map((opt) => (
          <button
            key={opt}
            type="button"
            onClick={() => onChange(opt)}
            className={cn(
              "rounded-xl border px-4 py-3 text-sm font-medium transition-colors",
              value === opt
                ? "border-primary-400 bg-primary-50 text-primary-700 dark:border-primary-700 dark:bg-primary-950 dark:text-primary-300"
                : "border-gray-200 text-gray-700 hover:border-primary-200 dark:border-gray-700 dark:text-gray-200"
            )}
          >
            {opt}
          </button>
        ))}
      </div>
    );
  }

  if (question.type === "fill-blank") {
    return (
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Type your answer..."
        className="w-full rounded-xl border border-gray-200 bg-transparent px-4 py-2.5 text-sm text-gray-800 outline-none focus:border-primary-400 dark:border-gray-700 dark:text-gray-100"
      />
    );
  }

  // short-answer / long-answer
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      rows={question.type === "long-answer" ? 8 : 4}
      placeholder="Write your answer..."
      className="w-full rounded-xl border border-gray-200 bg-transparent px-4 py-2.5 text-sm text-gray-800 outline-none focus:border-primary-400 dark:border-gray-700 dark:text-gray-100"
    />
  );
}
