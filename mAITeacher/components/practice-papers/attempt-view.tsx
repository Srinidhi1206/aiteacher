"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Flag, Timer } from "lucide-react";
import { Paper } from "@/lib/types";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { QuestionRenderer } from "@/components/practice-papers/question-renderer";
import { QuestionNavigator, QuestionNavState } from "@/components/practice-papers/question-navigator";
import { saveAttempt } from "@/lib/attempt-store";

function formatTime(totalSeconds: number) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

const bloomLabels: Record<number, string> = { 1: "Remember", 2: "Understand", 3: "Apply", 4: "Analyze" };

export function AttemptView({ paper }: { paper: Paper }) {
  const router = useRouter();
  const [index, setIndex] = React.useState(0);
  const [answers, setAnswers] = React.useState<Record<string, string>>({});
  const [flagged, setFlagged] = React.useState<Set<string>>(new Set());
  const [timeLeft, setTimeLeft] = React.useState(paper.durationMinutes * 60);
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const startedAtRef = React.useRef(Date.now());
  const submittedRef = React.useRef(false);

  const question = paper.questions[index];

  const submit = React.useCallback(() => {
    if (submittedRef.current) return;
    submittedRef.current = true;
    const timeTakenSeconds = Math.round((Date.now() - startedAtRef.current) / 1000);
    saveAttempt(paper.id, { answers, timeTakenSeconds });
    router.push(`/practice-papers/${paper.id}/results`);
  }, [answers, paper.id, router]);

  React.useEffect(() => {
    const timer = window.setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          window.clearInterval(timer);
          submit();
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [submit]);

  const answeredCount = Object.values(answers).filter((v) => v && v.trim().length > 0).length;

  const navStates: QuestionNavState[] = paper.questions.map((q, i) => {
    if (i === index) return "current";
    if (flagged.has(q.id)) return "flagged";
    if (answers[q.id]?.trim()) return "answered";
    return "unanswered";
  });

  function toggleFlag() {
    setFlagged((prev) => {
      const next = new Set(prev);
      if (next.has(question.id)) next.delete(question.id);
      else next.add(question.id);
      return next;
    });
  }

  const isLow = timeLeft < 300;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_280px]">
      <Card>
        <CardContent className="space-y-5 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-gray-400">
                Question {index + 1} of {paper.questions.length}
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                <Badge variant="outline">{question.topic}</Badge>
                <Badge variant="default">{bloomLabels[question.bloomLevel]}</Badge>
                <Badge variant="primary">{question.marks} marks</Badge>
              </div>
            </div>
            <div className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm font-semibold ${isLow ? "bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400" : "bg-primary-50 text-primary-700 dark:bg-primary-950 dark:text-primary-300"}`}>
              <Timer className="h-4 w-4" /> {formatTime(timeLeft)}
            </div>
          </div>

          <p className="text-base font-medium text-gray-900 dark:text-gray-50">{question.prompt}</p>

          <QuestionRenderer
            question={question}
            value={answers[question.id] ?? ""}
            onChange={(v) => setAnswers((prev) => ({ ...prev, [question.id]: v }))}
          />

          <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={index === 0} onClick={() => setIndex((i) => Math.max(0, i - 1))}>
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={index === paper.questions.length - 1}
                onClick={() => setIndex((i) => Math.min(paper.questions.length - 1, i + 1))}
              >
                Next
              </Button>
              <Button variant={flagged.has(question.id) ? "primary" : "ghost"} size="sm" onClick={toggleFlag}>
                <Flag className="h-3.5 w-3.5" /> {flagged.has(question.id) ? "Flagged" : "Flag"}
              </Button>
            </div>
            <Button variant="success" onClick={() => setConfirmOpen(true)}>
              Submit Paper
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="h-fit lg:sticky lg:top-20">
        <CardContent className="space-y-4 p-5">
          <div>
            <p className="text-sm font-semibold text-gray-900 dark:text-gray-50">{paper.title}</p>
            <p className="mt-1 text-xs text-gray-400">
              {answeredCount}/{paper.questions.length} answered
            </p>
          </div>
          <QuestionNavigator total={paper.questions.length} states={navStates} onJump={setIndex} />
        </CardContent>
      </Card>

      <Modal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Submit this paper?"
        description={`You've answered ${answeredCount} of ${paper.questions.length} questions${flagged.size ? `, with ${flagged.size} flagged for review` : ""}. This cannot be undone.`}
      >
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setConfirmOpen(false)}>
            Keep Working
          </Button>
          <Button variant="success" onClick={submit}>
            Yes, Submit
          </Button>
        </div>
      </Modal>
    </div>
  );
}
