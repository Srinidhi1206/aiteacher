"use client";
import * as React from "react";
import { Layers } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { CLASS_OPTIONS } from "@/lib/classes";
import { subjects } from "@/lib/mock-data/subjects";

const inputClasses =
  "w-full rounded-xl border border-gray-200 bg-transparent px-3 py-2 text-sm text-gray-800 outline-none focus:border-primary-400 dark:border-gray-700 dark:text-gray-100 sm:w-56";

// Foundation-only: lets a teacher scope the dashboard to one class/subject.
// The rest of the dashboard still shows all mock data - wiring this selection
// to actually filter every card is a Step 3+ concern once real data exists.
export function ClassSubjectSelector({
  onChange,
}: {
  onChange?: (selection: { className: string; subject: string }) => void;
}) {
  const [className, setClassName] = React.useState("Class 9");
  const [subject, setSubject] = React.useState(subjects[0].name);

  React.useEffect(() => {
    onChange?.({ className, subject });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [className, subject]);

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:gap-6">
        <div className="flex items-center gap-2 text-sm font-medium text-gray-500 dark:text-gray-400">
          <Layers className="h-4 w-4 text-primary-500" /> Viewing
        </div>
        <div className="flex flex-1 flex-col gap-3 sm:flex-row">
          <div className="flex-1">
            <label className="mb-1 block text-xs font-semibold text-gray-500">Class</label>
            <select value={className} onChange={(e) => setClassName(e.target.value)} className={inputClasses}>
              {CLASS_OPTIONS.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex-1">
            <label className="mb-1 block text-xs font-semibold text-gray-500">Subject</label>
            <select value={subject} onChange={(e) => setSubject(e.target.value)} className={inputClasses}>
              {subjects.map((s) => (
                <option key={s.id} value={s.name}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
