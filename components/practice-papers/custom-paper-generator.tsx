"use client";
import * as React from "react";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { subjects } from "@/lib/mock-data/subjects";
import { generateCustomPaper } from "@/lib/mock-data/custom-paper-generator";
import { Paper } from "@/lib/types";
import { cn } from "@/lib/utils";

const bloomLabels = ["Remember", "Understand", "Apply", "Analyze"];

export function CustomPaperGenerator({ onGenerate }: { onGenerate: (paper: Paper) => void }) {
  const [subjectName, setSubjectName] = React.useState(subjects[0].name);
  const allTopics = React.useMemo(() => {
    const subject = subjects.find((s) => s.name === subjectName);
    return subject ? subject.chapters.flatMap((c) => c.topics.map((t) => t.name)) : [];
  }, [subjectName]);

  const [selectedTopics, setSelectedTopics] = React.useState<string[]>([]);
  const [numQuestions, setNumQuestions] = React.useState(10);
  const [marks, setMarks] = React.useState(50);
  const [minutes, setMinutes] = React.useState(60);
  const [difficulty, setDifficulty] = React.useState<"Easy" | "Medium" | "Hard" | "Mixed">("Medium");
  const [bloomCounts, setBloomCounts] = React.useState<[number, number, number, number]>([3, 3, 2, 2]);

  React.useEffect(() => {
    setSelectedTopics(allTopics.slice(0, 3));
  }, [allTopics]);

  const bloomSum = bloomCounts.reduce((a, b) => a + b, 0);
  const bloomValid = bloomSum === numQuestions;
  const canGenerate = bloomValid && numQuestions > 0 && marks > 0 && minutes > 0 && selectedTopics.length > 0;

  function updateBloom(idx: number, value: number) {
    setBloomCounts((prev) => {
      const next = [...prev] as [number, number, number, number];
      next[idx] = Math.max(0, value);
      return next;
    });
  }

  function toggleTopic(name: string) {
    setSelectedTopics((prev) => (prev.includes(name) ? prev.filter((t) => t !== name) : [...prev, name]));
  }

  function handleGenerate() {
    const paper = generateCustomPaper({
      subject: subjectName,
      topics: selectedTopics,
      numQuestions,
      totalMarks: marks,
      durationMinutes: minutes,
      difficulty,
      bloomCounts,
    });
    onGenerate(paper);
  }

  return (
    <div className="space-y-5">
      <div>
        <label className="mb-1.5 block text-xs font-semibold text-gray-500">Subject</label>
        <select
          value={subjectName}
          onChange={(e) => setSubjectName(e.target.value)}
          className="w-full rounded-xl border border-gray-200 bg-transparent px-3 py-2 text-sm text-gray-800 outline-none focus:border-primary-400 dark:border-gray-700 dark:text-gray-100"
        >
          {subjects.map((s) => (
            <option key={s.id} value={s.name}>
              {s.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="mb-1.5 block text-xs font-semibold text-gray-500">Topics ({selectedTopics.length} selected)</label>
        <div className="flex max-h-32 flex-wrap gap-1.5 overflow-y-auto rounded-xl border border-gray-100 p-2 dark:border-gray-800">
          {allTopics.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => toggleTopic(t)}
              className={cn(
                "rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
                selectedTopics.includes(t)
                  ? "bg-primary-600 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300"
              )}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-gray-500">Questions</label>
          <input
            type="number"
            min={1}
            max={30}
            value={numQuestions}
            onChange={(e) => setNumQuestions(Number(e.target.value))}
            className="w-full rounded-xl border border-gray-200 bg-transparent px-3 py-2 text-sm text-gray-800 outline-none focus:border-primary-400 dark:border-gray-700 dark:text-gray-100"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-gray-500">Total Marks</label>
          <input
            type="number"
            min={1}
            value={marks}
            onChange={(e) => setMarks(Number(e.target.value))}
            className="w-full rounded-xl border border-gray-200 bg-transparent px-3 py-2 text-sm text-gray-800 outline-none focus:border-primary-400 dark:border-gray-700 dark:text-gray-100"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-gray-500">Time (min)</label>
          <input
            type="number"
            min={5}
            value={minutes}
            onChange={(e) => setMinutes(Number(e.target.value))}
            className="w-full rounded-xl border border-gray-200 bg-transparent px-3 py-2 text-sm text-gray-800 outline-none focus:border-primary-400 dark:border-gray-700 dark:text-gray-100"
          />
        </div>
      </div>

      <div>
        <label className="mb-1.5 block text-xs font-semibold text-gray-500">Difficulty</label>
        <div className="flex gap-2">
          {(["Easy", "Medium", "Hard", "Mixed"] as const).map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDifficulty(d)}
              className={cn(
                "rounded-xl px-3 py-1.5 text-xs font-medium transition-colors",
                difficulty === d ? "bg-primary-600 text-white" : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300"
              )}
            >
              {d}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="mb-1.5 block text-xs font-semibold text-gray-500">Bloom Level Distribution</label>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {bloomLabels.map((label, idx) => (
            <div key={label}>
              <span className="text-[11px] text-gray-400">{label}</span>
              <input
                type="number"
                min={0}
                value={bloomCounts[idx]}
                onChange={(e) => updateBloom(idx, Number(e.target.value))}
                className="w-full rounded-xl border border-gray-200 bg-transparent px-3 py-1.5 text-sm text-gray-800 outline-none focus:border-primary-400 dark:border-gray-700 dark:text-gray-100"
              />
            </div>
          ))}
        </div>
        <div className={cn("mt-2 flex items-center gap-1.5 text-xs", bloomValid ? "text-success-600 dark:text-success-400" : "text-red-600 dark:text-red-400")}>
          {bloomValid ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertCircle className="h-3.5 w-3.5" />}
          {bloomValid
            ? `Distribution matches ${numQuestions} questions.`
            : `Bloom levels sum to ${bloomSum}, but you need ${numQuestions} questions.`}
        </div>
      </div>

      <Button className="w-full" disabled={!canGenerate} onClick={handleGenerate}>
        Generate Paper
      </Button>
    </div>
  );
}
