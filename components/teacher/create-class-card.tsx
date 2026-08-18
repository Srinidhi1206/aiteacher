"use client";
import * as React from "react";
import { Users, Plus } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { classRooms as initialClasses } from "@/lib/mock-data/teacher";
import { subjects } from "@/lib/mock-data/subjects";
import { subjectColorClasses } from "@/lib/subject-colors";

const inputClasses =
  "w-full rounded-xl border border-gray-200 bg-transparent px-3 py-2 text-sm text-gray-800 outline-none focus:border-primary-400 dark:border-gray-700 dark:text-gray-100";

export function CreateClassCard() {
  const [classes, setClasses] = React.useState(initialClasses);
  const [showForm, setShowForm] = React.useState(false);
  const [name, setName] = React.useState("");
  const [subjectName, setSubjectName] = React.useState(subjects[0].name);
  const [grade, setGrade] = React.useState("Class 11");
  const { showToast } = useToast();

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    const subject = subjects.find((s) => s.name === subjectName);
    setClasses((prev) => [
      {
        id: `cls-${prev.length + 1}`,
        name,
        subject: subjectName,
        grade,
        studentCount: 0,
        avgProgress: 0,
        color: subject?.color ?? "indigo",
      },
      ...prev,
    ]);
    showToast(`Class "${name}" created`, "Invite students by sharing the class code from the class page.");
    setName("");
    setShowForm(false);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-4 w-4 text-primary-500" /> Your Classes
        </CardTitle>
        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setShowForm((s) => !s)}>
          <Plus className="h-3.5 w-3.5" /> Create Class
        </Button>
      </CardHeader>
      <CardContent>
        {showForm && (
          <form onSubmit={handleCreate} className="mb-4 grid grid-cols-1 gap-3 rounded-xl border border-gray-100 p-4 dark:border-gray-800 sm:grid-cols-4">
            <input
              placeholder="Class name (e.g. Class 12 - Section A)"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={`${inputClasses} sm:col-span-2`}
            />
            <select value={subjectName} onChange={(e) => setSubjectName(e.target.value)} className={inputClasses}>
              {subjects.map((s) => (
                <option key={s.id} value={s.name}>
                  {s.name}
                </option>
              ))}
            </select>
            <select value={grade} onChange={(e) => setGrade(e.target.value)} className={inputClasses}>
              {["Class 9", "Class 10", "Class 11", "Class 12"].map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
            <Button type="submit" size="sm" className="sm:col-span-4">
              Create
            </Button>
          </form>
        )}

        <CardDescription className="mb-3">{classes.length} classes across your subjects</CardDescription>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {classes.map((c) => (
            <div key={c.id} className="rounded-xl border border-gray-100 p-3 dark:border-gray-800">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-gray-900 dark:text-gray-50">{c.name}</p>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${subjectColorClasses[c.color]?.soft ?? ""} ${subjectColorClasses[c.color]?.text ?? ""}`}>
                  {c.subject}
                </span>
              </div>
              <p className="mt-1 text-xs text-gray-400">
                {c.grade} - {c.studentCount} students - {c.avgProgress}% avg progress
              </p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
