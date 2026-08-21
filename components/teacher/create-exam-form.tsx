"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { createExam } from "@/lib/actions/exams";

const inputClasses =
  "w-full rounded-xl border border-gray-200 bg-transparent px-3 py-2 text-sm text-gray-800 outline-none focus:border-primary-400 dark:border-gray-700 dark:text-gray-100";

interface Assignment {
  schoolClassId: string;
  subjectId: string;
  schoolClass: { label: string };
  subject: { name: string };
}

export function CreateExamForm({ assignments }: { assignments: Assignment[] }) {
  const [showForm, setShowForm] = React.useState(false);
  const [assignmentKey, setAssignmentKey] = React.useState(assignments[0] ? `${assignments[0].schoolClassId}::${assignments[0].subjectId}` : "");
  const [title, setTitle] = React.useState("");
  const [chapterScope, setChapterScope] = React.useState("");
  const [durationMinutes, setDurationMinutes] = React.useState(60);
  const [maxMarks, setMaxMarks] = React.useState(50);
  const [instructions, setInstructions] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const { showToast } = useToast();
  const router = useRouter();

  if (assignments.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
          You don&apos;t have any class/subject assignments yet. Ask an admin to assign you to a class and subject before creating
          exams.
        </CardContent>
      </Card>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !chapterScope.trim()) return;
    const [schoolClassId, subjectId] = assignmentKey.split("::");
    setSubmitting(true);
    const result = await createExam({ title, schoolClassId, subjectId, chapterScope, durationMinutes, maxMarks, instructions });
    setSubmitting(false);
    if (result.ok && result.data) {
      showToast("Exam created", "Now add questions before publishing.");
      router.push(`/teacher/exams/${result.data.id}`);
    } else {
      showToast("Could not create exam", result.error ?? "Please check the form and try again.");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Plus className="h-4 w-4 text-primary-500" /> Create Exam
        </CardTitle>
        <Button size="sm" variant="outline" onClick={() => setShowForm((s) => !s)}>
          {showForm ? "Cancel" : "New Exam"}
        </Button>
      </CardHeader>
      {showForm && (
        <CardContent>
          <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <input
              placeholder="Exam title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              className={`${inputClasses} sm:col-span-2`}
            />
            <select value={assignmentKey} onChange={(e) => setAssignmentKey(e.target.value)} className={inputClasses}>
              {assignments.map((a) => (
                <option key={`${a.schoolClassId}::${a.subjectId}`} value={`${a.schoolClassId}::${a.subjectId}`}>
                  {a.schoolClass.label} - {a.subject.name}
                </option>
              ))}
            </select>
            <input
              placeholder="Chapter / scope (e.g. Chapters 1-4)"
              value={chapterScope}
              onChange={(e) => setChapterScope(e.target.value)}
              required
              className={inputClasses}
            />
            <label className="text-xs text-gray-500">
              Duration (minutes)
              <input
                type="number"
                min={1}
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(Number(e.target.value))}
                className={`${inputClasses} mt-1`}
              />
            </label>
            <label className="text-xs text-gray-500">
              Total marks
              <input
                type="number"
                min={1}
                value={maxMarks}
                onChange={(e) => setMaxMarks(Number(e.target.value))}
                className={`${inputClasses} mt-1`}
              />
            </label>
            <textarea
              placeholder="Instructions (optional)"
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              rows={2}
              className={`${inputClasses} sm:col-span-2`}
            />
            <Button type="submit" size="sm" disabled={submitting} className="sm:col-span-2">
              {submitting ? "Creating..." : "Create Draft Exam"}
            </Button>
          </form>
        </CardContent>
      )}
    </Card>
  );
}
