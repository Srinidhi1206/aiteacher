"use client";
// The practice session. Answers are held in the page only until Submit; the
// server then grades them against its own stored answer key (submitPractice) -
// the browser never receives correct answers before that and never sends a score.
import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { submitPractice, type PracticeQuestionView } from "@/lib/actions/practice";

export function PracticeAttempt({ paperId, title, questions }: { paperId: string; title: string; questions: PracticeQuestionView[] }) {
  const router = useRouter();
  const [answers, setAnswers] = React.useState<Record<string, string>>({});
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const answered = Object.keys(answers).length;

  async function handleSubmit() {
    if (answered < questions.length && !window.confirm(`You have answered ${answered} of ${questions.length}. Submit anyway?`)) return;
    setBusy(true);
    setError(null);
    const res = await submitPractice(paperId, answers);
    if (!res.ok) {
      setBusy(false);
      setError(res.error ?? "Could not submit your answers.");
      return;
    }
    router.push(`/practice-papers/${paperId}/results`);
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-50">{title}</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {answered}/{questions.length} answered
        </p>
      </div>

      {questions.map((q, i) => (
        <Card key={q.id}>
          <CardContent className="space-y-3 p-5">
            <p className="text-sm font-semibold text-gray-900 dark:text-gray-50">
              <span className="mr-2 text-gray-400">{i + 1}.</span>
              {q.prompt}
            </p>
            <div role="radiogroup" aria-label={`Question ${i + 1}`} className="space-y-2">
              {q.options.map((opt) => {
                const selected = answers[q.id] === opt;
                return (
                  <button
                    key={opt}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    disabled={busy}
                    onClick={() => setAnswers((prev) => ({ ...prev, [q.id]: opt }))}
                    className={cn(
                      "w-full rounded-xl border px-3 py-2.5 text-left text-sm transition-colors",
                      selected
                        ? "border-primary-400 bg-primary-50 text-primary-800 dark:bg-primary-950 dark:text-primary-200"
                        : "border-gray-200 text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                    )}
                  >
                    {opt}
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>
      ))}

      {error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
      <div className="flex justify-end">
        <Button onClick={handleSubmit} disabled={busy || answered === 0} className="gap-1.5">
          {busy && <Loader2 className="h-4 w-4 animate-spin" />} Submit answers
        </Button>
      </div>
    </div>
  );
}
