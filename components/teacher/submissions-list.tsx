"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { gradeExamAnswer, finalizeExamGrade } from "@/lib/actions/exams";

interface Answer {
  id: string;
  studentAnswer: string | null;
  marksAwarded: number | null;
  question: { id: string; prompt: string; type: string; marks: number; correctAnswer: string | null };
}
interface Submission {
  id: string;
  status: string;
  totalScore: number | null;
  maxScore: number | null;
  student: { user: { name: string } };
  answers: Answer[];
  grade: { feedback: string | null } | null;
}

export function SubmissionsList({ examId, submissions }: { examId: string; submissions: Submission[] }) {
  const [expanded, setExpanded] = React.useState<string | null>(null);

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Submissions</CardTitle>
          <CardDescription>{submissions.length} student{submissions.length === 1 ? "" : "s"}</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {submissions.length === 0 ? (
          <p className="py-6 text-center text-sm text-gray-400">No submissions yet.</p>
        ) : (
          submissions.map((s) => (
            <div key={s.id} className="rounded-xl border border-gray-100 dark:border-gray-800">
              <button
                onClick={() => setExpanded(expanded === s.id ? null : s.id)}
                className="flex w-full items-center justify-between gap-3 p-3 text-left"
              >
                <div className="flex items-center gap-2.5">
                  <Avatar initials={s.student.user.name.slice(0, 2).toUpperCase()} size="sm" />
                  <span className="text-sm font-medium text-gray-800 dark:text-gray-100">{s.student.user.name}</span>
                </div>
                <div className="flex items-center gap-2">
                  {s.totalScore != null ? (
                    <Badge variant="success">
                      {s.totalScore}/{s.maxScore}
                    </Badge>
                  ) : (
                    <Badge variant="warning">Pending review</Badge>
                  )}
                  <Badge variant="outline">{s.status}</Badge>
                </div>
              </button>
              {expanded === s.id && <SubmissionDetail submission={s} />}
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

function SubmissionDetail({ submission }: { submission: Submission }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [marks, setMarks] = React.useState<Record<string, number>>(
    Object.fromEntries(submission.answers.map((a) => [a.id, a.marksAwarded ?? 0]))
  );
  const [feedback, setFeedback] = React.useState(submission.grade?.feedback ?? "");
  const [saving, setSaving] = React.useState(false);

  async function handleSaveMark(answerId: string) {
    await gradeExamAnswer(answerId, marks[answerId] ?? 0);
    router.refresh();
  }

  async function handleFinalize() {
    setSaving(true);
    const result = await finalizeExamGrade(submission.id, feedback);
    setSaving(false);
    if (result.ok) {
      showToast("Grade finalized", "The student can now see their result.");
      router.refresh();
    } else {
      showToast("Could not finalize", result.error ?? "");
    }
  }

  return (
    <div className="space-y-3 border-t border-gray-100 p-3 dark:border-gray-800">
      {submission.answers.map((a) => (
        <div key={a.id} className="rounded-xl bg-gray-50 p-2.5 dark:bg-gray-800/60">
          <p className="text-xs font-medium text-gray-700 dark:text-gray-200">{a.question.prompt}</p>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Answer: {a.studentAnswer || "(no answer)"}</p>
          {(a.question.type === "SHORT_ANSWER" || a.question.type === "LONG_ANSWER") ? (
            <div className="mt-1.5 flex items-center gap-2">
              <input
                type="number"
                min={0}
                max={a.question.marks}
                value={marks[a.id] ?? 0}
                onChange={(e) => setMarks((m) => ({ ...m, [a.id]: Number(e.target.value) }))}
                className="w-16 rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs dark:border-gray-700 dark:bg-gray-900"
              />
              <span className="text-xs text-gray-400">/ {a.question.marks}</span>
              <Button size="sm" variant="outline" onClick={() => handleSaveMark(a.id)}>
                Save
              </Button>
            </div>
          ) : (
            <p className="mt-1 text-xs text-gray-400">Auto-graded: {a.marksAwarded ?? 0}/{a.question.marks}</p>
          )}
        </div>
      ))}
      <textarea
        placeholder="Feedback for the student (optional)"
        value={feedback}
        onChange={(e) => setFeedback(e.target.value)}
        rows={2}
        className="w-full rounded-xl border border-gray-200 bg-transparent px-3 py-2 text-xs text-gray-800 outline-none focus:border-primary-400 dark:border-gray-700 dark:text-gray-100"
      />
      <Button size="sm" onClick={handleFinalize} disabled={saving}>
        {saving ? "Saving..." : "Finalize Grade"}
      </Button>
    </div>
  );
}
