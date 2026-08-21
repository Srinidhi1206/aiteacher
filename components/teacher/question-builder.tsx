"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { addExamQuestion, deleteExamQuestion } from "@/lib/actions/exams";

const inputClasses =
  "w-full rounded-xl border border-gray-200 bg-transparent px-3 py-2 text-sm text-gray-800 outline-none focus:border-primary-400 dark:border-gray-700 dark:text-gray-100";

interface Question {
  id: string;
  type: string;
  prompt: string;
  options: unknown;
  correctAnswer: string | null;
  marks: number;
  order: number;
}

const QUESTION_TYPES = ["MCQ", "TRUE_FALSE", "SHORT_ANSWER", "LONG_ANSWER"];

export function QuestionBuilder({ examId, questions, isDraft }: { examId: string; questions: Question[]; isDraft: boolean }) {
  const [showForm, setShowForm] = React.useState(false);
  const [type, setType] = React.useState("MCQ");
  const [prompt, setPrompt] = React.useState("");
  const [optionsText, setOptionsText] = React.useState("Option A\nOption B\nOption C\nOption D");
  const [correctAnswer, setCorrectAnswer] = React.useState("");
  const [marks, setMarks] = React.useState(2);
  const [submitting, setSubmitting] = React.useState(false);
  const { showToast } = useToast();
  const router = useRouter();

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!prompt.trim()) return;
    setSubmitting(true);
    const options = type === "MCQ" ? optionsText.split("\n").map((o) => o.trim()).filter(Boolean) : undefined;
    const result = await addExamQuestion(examId, {
      type,
      prompt,
      options,
      correctAnswer: type === "SHORT_ANSWER" || type === "LONG_ANSWER" ? undefined : correctAnswer,
      marks,
    });
    setSubmitting(false);
    if (result.ok) {
      showToast("Question added", "");
      setPrompt("");
      setCorrectAnswer("");
      router.refresh();
    } else {
      showToast("Could not add question", result.error ?? "");
    }
  }

  async function handleDelete(questionId: string) {
    const result = await deleteExamQuestion(questionId);
    if (result.ok) router.refresh();
    else showToast("Could not delete question", result.error ?? "");
  }

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Questions</CardTitle>
          <CardDescription>{questions.length} question{questions.length === 1 ? "" : "s"}</CardDescription>
        </div>
        {isDraft && (
          <Button size="sm" variant="outline" onClick={() => setShowForm((s) => !s)}>
            {showForm ? "Cancel" : "Add Question"}
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {!isDraft && (
          <p className="rounded-xl bg-warning-50 p-3 text-xs text-warning-700 dark:bg-warning-900/20 dark:text-warning-400">
            This exam is {isDraft ? "a draft" : "no longer a draft"} - questions can only be edited while it&apos;s a draft, so
            already-submitted attempts can never be corrupted.
          </p>
        )}

        {showForm && isDraft && (
          <form onSubmit={handleAdd} className="grid grid-cols-1 gap-3 rounded-xl border border-gray-100 p-4 dark:border-gray-800 sm:grid-cols-2">
            <select value={type} onChange={(e) => setType(e.target.value)} className={inputClasses}>
              {QUESTION_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t.replace("_", " ")}
                </option>
              ))}
            </select>
            <input
              type="number"
              min={1}
              placeholder="Marks"
              value={marks}
              onChange={(e) => setMarks(Number(e.target.value))}
              className={inputClasses}
            />
            <textarea
              placeholder="Question text"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              required
              rows={2}
              className={`${inputClasses} sm:col-span-2`}
            />
            {type === "MCQ" && (
              <textarea
                placeholder="Options (one per line)"
                value={optionsText}
                onChange={(e) => setOptionsText(e.target.value)}
                rows={4}
                className={`${inputClasses} sm:col-span-2`}
              />
            )}
            {(type === "MCQ" || type === "TRUE_FALSE") && (
              <input
                placeholder={type === "TRUE_FALSE" ? "Correct answer (True or False)" : "Correct answer (must match one option exactly)"}
                value={correctAnswer}
                onChange={(e) => setCorrectAnswer(e.target.value)}
                required
                className={`${inputClasses} sm:col-span-2`}
              />
            )}
            {(type === "SHORT_ANSWER" || type === "LONG_ANSWER") && (
              <p className="text-xs text-gray-400 sm:col-span-2">
                This question type is graded manually by you after a student submits.
              </p>
            )}
            <Button type="submit" size="sm" disabled={submitting} className="sm:col-span-2">
              {submitting ? "Adding..." : "Add Question"}
            </Button>
          </form>
        )}

        {questions.length === 0 ? (
          <p className="py-4 text-center text-sm text-gray-400">No questions yet.</p>
        ) : (
          questions.map((q, i) => (
            <div key={q.id} className="flex items-start justify-between gap-3 rounded-xl border border-gray-100 p-3 dark:border-gray-800">
              <div>
                <p className="text-sm font-medium text-gray-800 dark:text-gray-100">
                  {i + 1}. {q.prompt}
                </p>
                <div className="mt-1 flex items-center gap-2 text-xs text-gray-400">
                  <Badge variant="outline">{q.type.replace("_", " ")}</Badge>
                  <span>{q.marks} marks</span>
                  {q.correctAnswer && <span>Answer: {q.correctAnswer}</span>}
                </div>
              </div>
              {isDraft && (
                <button onClick={() => handleDelete(q.id)} className="shrink-0 rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20">
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
