"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { createWorksheet } from "@/lib/actions/worksheets";
import { listChaptersForSubject } from "@/lib/actions/curriculum";
import { ALLOWED_MIME_TYPES, MAX_UPLOAD_BYTES } from "@/lib/storage/types";

const inputClasses =
  "w-full rounded-xl border border-gray-200 bg-transparent px-3 py-2 text-sm text-gray-800 outline-none focus:border-primary-400 dark:border-gray-700 dark:text-gray-100";

interface Assignment {
  schoolClassId: string;
  subjectId: string;
  schoolClass: { label: string };
  subject: { name: string };
}

type Chapter = Awaited<ReturnType<typeof listChaptersForSubject>>[number];

export function CreateWorksheetForm({ assignments }: { assignments: Assignment[] }) {
  const [showForm, setShowForm] = React.useState(false);
  const [assignmentKey, setAssignmentKey] = React.useState(assignments[0] ? `${assignments[0].schoolClassId}::${assignments[0].subjectId}` : "");
  const [title, setTitle] = React.useState("");
  const [instructions, setInstructions] = React.useState("");
  const [dueDate, setDueDate] = React.useState("");
  const [chapters, setChapters] = React.useState<Chapter[]>([]);
  const [chapterId, setChapterId] = React.useState("");
  const [topicId, setTopicId] = React.useState("");
  const [file, setFile] = React.useState<File | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const { showToast } = useToast();
  const router = useRouter();

  const subjectId = assignmentKey.split("::")[1];

  React.useEffect(() => {
    setChapterId("");
    setTopicId("");
    setChapters([]);
    if (!subjectId) return;
    listChaptersForSubject(subjectId)
      .then(setChapters)
      .catch(() => setChapters([]));
  }, [subjectId]);

  if (assignments.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
          You don&apos;t have any class/subject assignments yet. Ask an admin to assign you to a class and subject before creating
          worksheets.
        </CardContent>
      </Card>
    );
  }

  const topics = chapters.find((c) => c.id === chapterId)?.topics ?? [];

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!title.trim()) return setError("Title is required.");
    const [schoolClassId, subjId] = assignmentKey.split("::");

    setSubmitting(true);
    const result = await createWorksheet(
      {
        title,
        instructions: instructions || undefined,
        schoolClassId,
        subjectId: subjId,
        chapterId: chapterId || undefined,
        topicId: topicId || undefined,
        dueDate: dueDate ? new Date(dueDate).toISOString() : undefined,
      },
      file
    );
    setSubmitting(false);

    if (result.ok) {
      showToast("Worksheet created", "Publish it when you're ready for students to see it.");
      setShowForm(false);
      setTitle("");
      setInstructions("");
      setDueDate("");
      setChapterId("");
      setTopicId("");
      setFile(null);
      router.refresh();
    } else {
      setError(result.error ?? "Could not create worksheet.");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Plus className="h-4 w-4 text-primary-500" /> Create Worksheet
        </CardTitle>
        <Button size="sm" variant="outline" onClick={() => setShowForm((s) => !s)}>
          {showForm ? "Cancel" : "New Worksheet"}
        </Button>
      </CardHeader>
      {showForm && (
        <CardContent>
          <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <input
              placeholder="Worksheet title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              disabled={submitting}
              className={`${inputClasses} sm:col-span-2`}
            />
            <select value={assignmentKey} onChange={(e) => setAssignmentKey(e.target.value)} disabled={submitting} className={inputClasses}>
              {assignments.map((a) => (
                <option key={`${a.schoolClassId}::${a.subjectId}`} value={`${a.schoolClassId}::${a.subjectId}`}>
                  {a.schoolClass.label} - {a.subject.name}
                </option>
              ))}
            </select>
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} disabled={submitting} className={inputClasses} />
            <select value={chapterId} onChange={(e) => setChapterId(e.target.value)} disabled={submitting || chapters.length === 0} className={inputClasses}>
              <option value="">Chapter (optional)</option>
              {chapters.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <select value={topicId} onChange={(e) => setTopicId(e.target.value)} disabled={submitting || !chapterId} className={inputClasses}>
              <option value="">Topic (optional)</option>
              {topics.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
            <textarea
              placeholder="Instructions (optional)"
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              rows={3}
              disabled={submitting}
              className={`${inputClasses} sm:col-span-2`}
            />
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs text-gray-500">Attach a file (optional, up to {MAX_UPLOAD_BYTES / (1024 * 1024)}MB)</label>
              <input
                type="file"
                accept={ALLOWED_MIME_TYPES.join(",")}
                disabled={submitting}
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="text-xs text-gray-500"
              />
            </div>
            {error && <p className="text-sm text-red-600 dark:text-red-400 sm:col-span-2">{error}</p>}
            <Button type="submit" size="sm" disabled={submitting} className="sm:col-span-2">
              {submitting ? "Creating..." : "Create Worksheet"}
            </Button>
          </form>
        </CardContent>
      )}
    </Card>
  );
}
