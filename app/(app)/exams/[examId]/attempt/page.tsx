"use client";
import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import { Clock, Flag, ChevronLeft, ChevronRight } from "lucide-react";
import { Topbar } from "@/components/layout/topbar";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { getExamForAttempt, startExamAttempt, saveExamAnswer, submitExam } from "@/lib/actions/exams";
import { createAnswerSaver } from "@/lib/exams/answer-saver";

interface ExamQuestion {
  id: string;
  type: string;
  prompt: string;
  options: unknown;
  marks: number;
  order: number;
}
interface ExamData {
  id: string;
  title: string;
  subject: string;
  durationMinutes: number;
  maxMarks: number;
  instructions: string | null;
  questions: ExamQuestion[];
  /** Seconds left on the server-side clock, and answers already saved (both survive a reload). */
  remainingSeconds: number;
  savedAnswers: Record<string, string>;
}

export default function ExamAttemptPage() {
  const params = useParams<{ examId: string }>();
  const router = useRouter();

  const [exam, setExam] = React.useState<ExamData | null | undefined>(undefined);
  const [submissionId, setSubmissionId] = React.useState<string | null>(null);
  const [answers, setAnswers] = React.useState<Record<string, string>>({});
  const [flagged, setFlagged] = React.useState<Set<string>>(new Set());
  const [current, setCurrent] = React.useState(0);
  const [secondsLeft, setSecondsLeft] = React.useState<number | null>(null);
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  // Questions whose newest answer could not be saved yet (the server grades only what it has saved - see lib/exams/answer-saver.ts).
  const [unsaved, setUnsaved] = React.useState<string[]>([]);
  const saver = React.useRef<ReturnType<typeof createAnswerSaver> | null>(null);
  // The time-up submit is tried ONCE; if it fails the student is told and can press Submit again, instead of the page re-sending it in a tight loop.
  const autoSubmitTried = React.useRef(false);

  React.useEffect(() => {
    (async () => {
      try {
        const startResult = await startExamAttempt(params.examId);
        if (!startResult.ok || !startResult.data) {
          setError(startResult.error ?? "Unable to start this exam.");
          setExam(null);
          return;
        }
        const id = startResult.data.submissionId;
        setSubmissionId(id);
        saver.current = createAnswerSaver((questionId, value) => saveExamAnswer(id, questionId, value), setUnsaved);
        const data = await getExamForAttempt(params.examId);
        setExam(data as ExamData | null);
        if (data) {
          setSecondsLeft(data.remainingSeconds);
          setAnswers(data.savedAnswers ?? {});
        }
      } catch {
        // A thrown server action (connection or database trouble) must not leave the page on "Loading..." for ever.
        setError("The exam could not be loaded. Check your connection and reload the page - your saved answers and the clock are kept.");
        setExam(null);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.examId]);

  const handleSubmit = React.useCallback(
    async (timeIsUp = false) => {
      if (!submissionId || submitting) return;
      setSubmitting(true);
      setError(null);
      try {
        // Send again anything that did not reach the server: it grades from what it has saved, not from what is on the screen.
        const stillUnsaved = (await saver.current?.flush()) ?? [];
        if (stillUnsaved.length > 0 && !timeIsUp) {
          setError(`${stillUnsaved.length} answer${stillUnsaved.length === 1 ? "" : "s"} could not be saved. Check your connection and press Submit again - nothing has been submitted.`);
          setSubmitting(false);
          return;
        }
        const result = await submitExam(submissionId);
        if (result.ok) {
          router.push(`/exams/${params.examId}/results`);
        } else {
          setError(result.error ?? "Submission failed.");
          setSubmitting(false);
        }
      } catch {
        setError("Your exam could not be submitted - check your connection and press Submit again.");
        setSubmitting(false);
      }
    },
    [submissionId, submitting, params.examId, router]
  );

  React.useEffect(() => {
    if (secondsLeft === null || submitting) return;
    if (secondsLeft <= 0) {
      if (!autoSubmitTried.current) {
        autoSubmitTried.current = true;
        handleSubmit(true);
      }
      return;
    }
    const timer = setTimeout(() => setSecondsLeft((s) => (s !== null ? s - 1 : s)), 1000);
    return () => clearTimeout(timer);
  }, [secondsLeft, submitting, handleSubmit]);

  function handleAnswer(questionId: string, value: string) {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
    void saver.current?.set(questionId, value);
  }

  function toggleFlag(questionId: string) {
    setFlagged((prev) => {
      const next = new Set(prev);
      if (next.has(questionId)) next.delete(questionId);
      else next.add(questionId);
      return next;
    });
  }

  if (exam === undefined) {
    return (
      <>
        <Topbar title="Loading exam..." />
        <main className="flex-1 p-6 text-sm text-gray-500">Loading...</main>
      </>
    );
  }

  if (!exam) {
    return (
      <>
        <Topbar title="Exam unavailable" />
        <main className="flex-1 p-6">
          <Card>
            <CardContent className="py-10 text-center text-sm text-gray-500 dark:text-gray-400">
              {error ?? "This exam is not available - it may already be submitted or not yet published for your class."}
            </CardContent>
          </Card>
        </main>
      </>
    );
  }

  const question = exam.questions[current];
  const minutes = secondsLeft !== null ? Math.floor(secondsLeft / 60) : 0;
  const seconds = secondsLeft !== null ? secondsLeft % 60 : 0;
  const answeredCount = Object.keys(answers).length;

  return (
    <>
      <Topbar title={exam.title} />
      <main className="flex-1 space-y-4 p-4 sm:p-6">
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
            <div className="flex items-center gap-3 text-sm">
              <Badge variant="primary">{exam.subject}</Badge>
              <span className="text-gray-500 dark:text-gray-400">
                {answeredCount}/{exam.questions.length} answered
              </span>
            </div>
            <div
              className={cn(
                "flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm font-semibold",
                secondsLeft !== null && secondsLeft < 60 ? "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400" : "bg-primary-50 text-primary-700 dark:bg-primary-950 dark:text-primary-300"
              )}
            >
              <Clock className="h-4 w-4" />
              {String(minutes).padStart(2, "0")}:{String(seconds).padStart(2, "0")}
            </div>
          </CardContent>
        </Card>

        {unsaved.length > 0 && !error && (
          <p role="alert" className="rounded-xl bg-warning-50 px-3 py-2 text-xs text-warning-800 dark:bg-warning-900/20 dark:text-warning-300">
            {unsaved.length} answer{unsaved.length === 1 ? " has" : "s have"} not been saved yet - check your connection. {unsaved.length === 1 ? "It is" : "They are"} sent again when you submit.
          </p>
        )}
        {error && (
          <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950/30 dark:text-red-400">
            <span>{error}</span>
            {secondsLeft !== null && secondsLeft <= 0 && (
              <Button size="sm" onClick={() => handleSubmit(true)} disabled={submitting}>
                {submitting ? "Submitting..." : "Submit now"}
              </Button>
            )}
          </div>
        )}

        <div className="flex flex-wrap gap-1.5">
          {exam.questions.map((q, i) => (
            <button
              key={q.id}
              onClick={() => setCurrent(i)}
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-lg text-xs font-semibold transition-colors",
                i === current
                  ? "bg-primary-600 text-white"
                  : answers[q.id]
                  ? "bg-success-100 text-success-700 dark:bg-success-900/40 dark:text-success-400"
                  : flagged.has(q.id)
                  ? "bg-warning-100 text-warning-700 dark:bg-warning-900/40 dark:text-warning-400"
                  : "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400"
              )}
            >
              {i + 1}
            </button>
          ))}
        </div>

        {question && (
          <Card>
            <CardContent className="space-y-4 py-6">
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-semibold text-gray-500 dark:text-gray-400">
                  Question {current + 1} of {exam.questions.length} - {question.marks} mark{question.marks === 1 ? "" : "s"}
                </p>
                <button
                  onClick={() => toggleFlag(question.id)}
                  className={cn(
                    "flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium",
                    flagged.has(question.id) ? "bg-warning-100 text-warning-700 dark:bg-warning-900/40 dark:text-warning-400" : "text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
                  )}
                >
                  <Flag className="h-3.5 w-3.5" /> {flagged.has(question.id) ? "Flagged" : "Flag"}
                </button>
              </div>
              <p className="text-base text-gray-900 dark:text-gray-50">{question.prompt}</p>

              {question.type === "MCQ" && Array.isArray(question.options) && (
                <div className="space-y-2">
                  {(question.options as string[]).map((opt) => (
                    <button
                      key={opt}
                      onClick={() => handleAnswer(question.id, opt)}
                      disabled={submitting}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-xl border px-4 py-2.5 text-left text-sm transition-colors",
                        answers[question.id] === opt
                          ? "border-primary-500 bg-primary-50 text-primary-700 dark:bg-primary-950 dark:text-primary-300"
                          : "border-gray-200 text-gray-700 hover:border-gray-300 dark:border-gray-700 dark:text-gray-200"
                      )}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              )}

              {question.type === "TRUE_FALSE" && (
                <div className="flex gap-2">
                  {["True", "False"].map((opt) => (
                    <button
                      key={opt}
                      onClick={() => handleAnswer(question.id, opt)}
                      disabled={submitting}
                      className={cn(
                        "flex-1 rounded-xl border px-4 py-2.5 text-sm font-medium transition-colors",
                        answers[question.id] === opt
                          ? "border-primary-500 bg-primary-50 text-primary-700 dark:bg-primary-950 dark:text-primary-300"
                          : "border-gray-200 text-gray-700 hover:border-gray-300 dark:border-gray-700 dark:text-gray-200"
                      )}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              )}

              {(question.type === "SHORT_ANSWER" || question.type === "LONG_ANSWER") && (
                <textarea
                  value={answers[question.id] ?? ""}
                  onChange={(e) => handleAnswer(question.id, e.target.value)}
                  disabled={submitting}
                  rows={question.type === "LONG_ANSWER" ? 8 : 3}
                  placeholder="Type your answer..."
                  className="w-full rounded-xl border border-gray-200 bg-transparent px-3.5 py-2.5 text-sm text-gray-900 outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100 dark:border-gray-700 dark:text-gray-100"
                />
              )}
            </CardContent>
          </Card>
        )}

        <div className="flex items-center justify-between">
          <Button variant="outline" onClick={() => setCurrent((c) => Math.max(0, c - 1))} disabled={current === 0}>
            <ChevronLeft className="h-4 w-4" /> Previous
          </Button>
          {current < exam.questions.length - 1 ? (
            <Button onClick={() => setCurrent((c) => Math.min(exam.questions.length - 1, c + 1))}>
              Next <ChevronRight className="h-4 w-4" />
            </Button>
          ) : (
            <Button onClick={() => setConfirmOpen(true)} disabled={submitting}>
              Submit Exam
            </Button>
          )}
        </div>
      </main>

      <Modal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Submit exam?"
        description={`You've answered ${answeredCount} of ${exam.questions.length} questions. Once submitted, you cannot change your answers.`}
      >
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setConfirmOpen(false)}>
            Keep reviewing
          </Button>
          <Button onClick={() => handleSubmit()} disabled={submitting}>
            {submitting ? "Submitting..." : "Submit"}
          </Button>
        </div>
      </Modal>
    </>
  );
}
