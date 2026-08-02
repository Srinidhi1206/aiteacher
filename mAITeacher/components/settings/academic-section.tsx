"use client";
import * as React from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { currentStudent } from "@/lib/mock-data/students";
import { subjects as allSubjectRecords } from "@/lib/mock-data/subjects";
import { cn } from "@/lib/utils";

const inputClasses =
  "w-full rounded-xl border border-gray-200 bg-transparent px-3 py-2 text-sm text-gray-800 outline-none focus:border-primary-400 dark:border-gray-700 dark:text-gray-100";

const grades = ["Class 9", "Class 10", "Class 11", "Class 12"];
const curricula = ["CBSE", "ICSE", "State Board", "IB", "IGCSE", "University"];
const allSubjectNames = [
  "Mathematics",
  "Physics",
  "Chemistry",
  "Biology",
  "English",
  "Computer Science",
  "Economics",
  "History",
];

export function AcademicSection() {
  const [grade, setGrade] = React.useState(currentStudent.grade);
  const [curriculum, setCurriculum] = React.useState(currentStudent.curriculum);
  const [board, setBoard] = React.useState(currentStudent.board ?? currentStudent.curriculum);
  const [selectedSubjects, setSelectedSubjects] = React.useState<string[]>(allSubjectRecords.map((s) => s.name));
  const { showToast } = useToast();

  function toggleSubject(name: string) {
    setSelectedSubjects((prev) => (prev.includes(name) ? prev.filter((s) => s !== name) : [...prev, name]));
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Academic Details</CardTitle>
        <CardDescription className="hidden sm:block">Grade, curriculum, board and subjects - same fields from onboarding</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-gray-500">Grade</label>
            <select value={grade} onChange={(e) => setGrade(e.target.value)} className={inputClasses}>
              {grades.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-gray-500">Curriculum</label>
            <select value={curriculum} onChange={(e) => setCurriculum(e.target.value as typeof curriculum)} className={inputClasses}>
              {curricula.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-gray-500">Board</label>
            <input value={board} onChange={(e) => setBoard(e.target.value)} className={inputClasses} />
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-semibold text-gray-500">Subjects ({selectedSubjects.length} selected)</label>
          <div className="flex flex-wrap gap-1.5">
            {allSubjectNames.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => toggleSubject(s)}
                className={cn(
                  "rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                  selectedSubjects.includes(s)
                    ? "bg-primary-600 text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300"
                )}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        <div className="flex justify-end">
          <Button size="sm" onClick={() => showToast("Academic details updated", "Your subjects and board preferences were saved.")}>
            Save Changes
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
