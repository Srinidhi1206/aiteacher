"use client";
import * as React from "react";
import { CalendarClock, Plus } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { scheduledExams as initialExams } from "@/lib/mock-data/admin-config";
import { CLASS_OPTIONS } from "@/lib/classes";
import { subjects } from "@/lib/mock-data/subjects";

const inputClasses =
  "w-full rounded-xl border border-gray-200 bg-transparent px-3 py-2 text-sm text-gray-800 outline-none focus:border-primary-400 dark:border-gray-700 dark:text-gray-100";

export function ExamScheduleCard() {
  const [exams, setExams] = React.useState(initialExams);
  const [showForm, setShowForm] = React.useState(false);
  const [subject, setSubject] = React.useState(subjects[0].name);
  const [className, setClassName] = React.useState(CLASS_OPTIONS[9].value);
  const [chapterScope, setChapterScope] = React.useState("");
  const [date, setDate] = React.useState("");
  const [maxMarks, setMaxMarks] = React.useState(50);
  const { showToast } = useToast();

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!chapterScope.trim() || !date) return;
    setExams((prev) => [
      { id: `exam-${prev.length + 1}`, subject, className, chapterScope, date, maxMarks },
      ...prev,
    ]);
    showToast("Exam scheduled", `${subject} - ${className} on ${date}.`);
    setChapterScope("");
    setDate("");
    setShowForm(false);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarClock className="h-4 w-4 text-primary-500" /> Exam Schedule
        </CardTitle>
        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setShowForm((s) => !s)}>
          <Plus className="h-3.5 w-3.5" /> Schedule Exam
        </Button>
      </CardHeader>
      <CardContent>
        {showForm && (
          <form onSubmit={handleCreate} className="mb-4 grid grid-cols-1 gap-3 rounded-xl border border-gray-100 p-4 dark:border-gray-800 sm:grid-cols-3">
            <select value={subject} onChange={(e) => setSubject(e.target.value)} className={inputClasses}>
              {subjects.map((s) => (
                <option key={s.id} value={s.name}>
                  {s.name}
                </option>
              ))}
            </select>
            <select value={className} onChange={(e) => setClassName(e.target.value)} className={inputClasses}>
              {CLASS_OPTIONS.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
              className={inputClasses}
            />
            <input
              placeholder="Chapter / scope (e.g. Chapters 1-4)"
              value={chapterScope}
              onChange={(e) => setChapterScope(e.target.value)}
              required
              className={`${inputClasses} sm:col-span-2`}
            />
            <input
              type="number"
              min={1}
              placeholder="Max marks"
              value={maxMarks}
              onChange={(e) => setMaxMarks(Number(e.target.value))}
              className={inputClasses}
            />
            <Button type="submit" size="sm" className="sm:col-span-3">
              Schedule
            </Button>
          </form>
        )}

        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-xs uppercase tracking-wide text-gray-400 dark:border-gray-800">
                <th className="py-2 pr-3 font-medium">Subject</th>
                <th className="py-2 pr-3 font-medium">Class</th>
                <th className="py-2 pr-3 font-medium">Scope</th>
                <th className="py-2 pr-3 font-medium">Date</th>
                <th className="py-2 pr-3 font-medium">Marks</th>
              </tr>
            </thead>
            <tbody>
              {exams.map((ex) => (
                <tr key={ex.id} className="border-b border-gray-50 last:border-0 dark:border-gray-800/60">
                  <td className="py-2.5 pr-3 font-medium text-gray-800 dark:text-gray-100">{ex.subject}</td>
                  <td className="py-2.5 pr-3 text-gray-500 dark:text-gray-400">{ex.className}</td>
                  <td className="py-2.5 pr-3 text-gray-500 dark:text-gray-400">{ex.chapterScope}</td>
                  <td className="py-2.5 pr-3 text-gray-500 dark:text-gray-400">{ex.date}</td>
                  <td className="py-2.5 pr-3 text-gray-500 dark:text-gray-400">{ex.maxMarks}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
