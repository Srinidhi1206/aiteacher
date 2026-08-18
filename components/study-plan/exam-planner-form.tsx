"use client";
import * as React from "react";
import { Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { subjects } from "@/lib/mock-data/subjects";
import { generateExamPlan } from "@/lib/mock-data/study-plan";
import type { ExamPlanOutput } from "@/lib/types";
import { cn } from "@/lib/utils";

const inputClasses =
  "w-full rounded-xl border border-gray-200 bg-transparent px-3 py-2 text-sm text-gray-800 outline-none focus:border-primary-400 dark:border-gray-700 dark:text-gray-100";

export function ExamPlannerForm({ onGenerate }: { onGenerate: (plan: ExamPlanOutput) => void }) {
  const [examName, setExamName] = React.useState("Mathematics Unit Test 3");
  const [examDate, setExamDate] = React.useState("2026-07-28");
  const [subjectName, setSubjectName] = React.useState(subjects[0].name);
  const allChapters = React.useMemo(() => {
    const subject = subjects.find((s) => s.name === subjectName);
    return subject ? subject.chapters.map((c) => c.name) : [];
  }, [subjectName]);
  const [selectedChapters, setSelectedChapters] = React.useState<string[]>([]);
  const [weightage, setWeightage] = React.useState(20);
  const [priority, setPriority] = React.useState<"High" | "Medium" | "Low">("High");
  const [hoursPerDay, setHoursPerDay] = React.useState(2.5);

  React.useEffect(() => {
    setSelectedChapters(allChapters.slice(0, 2));
  }, [allChapters]);

  function toggleChapter(name: string) {
    setSelectedChapters((prev) => (prev.includes(name) ? prev.filter((c) => c !== name) : [...prev, name]));
  }

  const canGenerate = examName.trim().length > 0 && Boolean(examDate) && selectedChapters.length > 0;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canGenerate) return;
    const plan = generateExamPlan({
      examName,
      examDate,
      subject: subjectName,
      chapters: selectedChapters,
      weightage,
      priority,
      availableHoursPerDay: hoursPerDay,
    });
    onGenerate(plan);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-gray-500">Exam Name</label>
          <input value={examName} onChange={(e) => setExamName(e.target.value)} className={inputClasses} placeholder="e.g. Physics Mid Term" />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-gray-500">Exam Date</label>
          <input type="date" value={examDate} onChange={(e) => setExamDate(e.target.value)} className={inputClasses} />
        </div>
      </div>

      <div>
        <label className="mb-1.5 block text-xs font-semibold text-gray-500">Subject</label>
        <select value={subjectName} onChange={(e) => setSubjectName(e.target.value)} className={inputClasses}>
          {subjects.map((s) => (
            <option key={s.id} value={s.name}>
              {s.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="mb-1.5 block text-xs font-semibold text-gray-500">
          Syllabus / Chapters ({selectedChapters.length} selected)
        </label>
        <div className="flex max-h-32 flex-wrap gap-1.5 overflow-y-auto rounded-xl border border-gray-100 p-2 dark:border-gray-800">
          {allChapters.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => toggleChapter(c)}
              className={cn(
                "rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
                selectedChapters.includes(c)
                  ? "bg-primary-600 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300"
              )}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-gray-500">Weightage (%)</label>
          <input
            type="number"
            min={1}
            max={100}
            value={weightage}
            onChange={(e) => setWeightage(Number(e.target.value))}
            className={inputClasses}
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-gray-500">Hours / Day</label>
          <input
            type="number"
            min={0.5}
            step={0.5}
            value={hoursPerDay}
            onChange={(e) => setHoursPerDay(Number(e.target.value))}
            className={inputClasses}
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-gray-500">Priority</label>
          <select value={priority} onChange={(e) => setPriority(e.target.value as "High" | "Medium" | "Low")} className={inputClasses}>
            <option value="High">High</option>
            <option value="Medium">Medium</option>
            <option value="Low">Low</option>
          </select>
        </div>
      </div>

      <Button type="submit" className="w-full gap-2" disabled={!canGenerate}>
        <Wand2 className="h-4 w-4" />
        Generate Exam Plan
      </Button>
    </form>
  );
}
