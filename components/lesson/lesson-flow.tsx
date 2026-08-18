"use client";
import * as React from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, XCircle } from "lucide-react";
import { LessonPlan } from "@/lib/types";
import { isLessonAnswerCorrect } from "@/lib/mock-data/lesson-content";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LessonProgressBar } from "@/components/lesson/lesson-progress-bar";
import { LessonQuestionCard } from "@/components/lesson/lesson-question-card";
import { ReteachCard } from "@/components/lesson/reteach-card";
import { LessonSummary, BloomResult } from "@/components/lesson/lesson-summary";

type Phase = "explain" | "examples" | "quiz" | "complete";
type Status = "answering" | "correct" | "incorrect" | "reteach";

const emptyResults: Record<number, BloomResult> = {
  1: { correct: 0, total: 0, xp: 0 },
  2: { correct: 0, total: 0, xp: 0 },
  3: { correct: 0, total: 0, xp: 0 },
  4: { correct: 0, total: 0, xp: 0 },
};

export function LessonFlow({
  plan,
  topicName,
  chapterName,
  subjectName,
  subjectSlug,
  topicSlug,
  recap,
}: {
  plan: LessonPlan;
  topicName: string;
  chapterName: string;
  subjectName: string;
  subjectSlug: string;
  topicSlug: string;
  recap: string[];
}) {
  const [phase, setPhase] = React.useState<Phase>("explain");
  const [qIndex, setQIndex] = React.useState(0);
  const [answer, setAnswer] = React.useState("");
  const [status, setStatus] = React.useState<Status>("answering");
  const [attempt, setAttempt] = React.useState(1);
  const [results, setResults] = React.useState<Record<number, BloomResult>>(emptyResults);
  const [xpEarned, setXpEarned] = React.useState(0);

  const question = plan.questions[qIndex];

  function handleSubmit() {
    if (!answer.trim()) return;
    const correct = isLessonAnswerCorrect(question, answer);

    if (correct) {
      const xp = attempt === 1 ? question.xp : Math.round(question.xp / 2);
      setStatus("correct");
      setXpEarned((x) => x + xp);
      setResults((prev) => ({
        ...prev,
        [question.bloomLevel]: {
          correct: prev[question.bloomLevel].correct + 1,
          total: prev[question.bloomLevel].total + 1,
          xp: prev[question.bloomLevel].xp + xp,
        },
      }));
    } else if (attempt === 1) {
      setStatus("reteach");
    } else {
      setStatus("incorrect");
      setResults((prev) => ({
        ...prev,
        [question.bloomLevel]: {
          correct: prev[question.bloomLevel].correct,
          total: prev[question.bloomLevel].total + 1,
          xp: prev[question.bloomLevel].xp,
        },
      }));
    }
  }

  function handleRetry() {
    setAttempt(2);
    setAnswer("");
    setStatus("answering");
  }

  function handleContinue() {
    if (qIndex + 1 >= plan.questions.length) {
      setPhase("complete");
      return;
    }
    setQIndex((i) => i + 1);
    setAnswer("");
    setAttempt(1);
    setStatus("answering");
  }

  const backLink = (
    <Link
      href={`/subjects/${subjectSlug}/${topicSlug}`}
      className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-gray-800 dark:hover:text-gray-200"
    >
      <ArrowLeft className="h-4 w-4" /> {topicName}
    </Link>
  );

  if (phase === "explain") {
    return (
      <div className="space-y-4">
        {backLink}
        <Card>
          <CardContent className="space-y-4 p-6">
            <div>
              <p className="text-xs font-medium text-gray-400">
                {subjectName} - {chapterName}
              </p>
              <h2 className="mt-0.5 text-lg font-semibold text-gray-900 dark:text-gray-50">Let&apos;s recap: {topicName}</h2>
            </div>
            <ul className="space-y-2">
              {recap.map((r, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary-400" />
                  {r}
                </li>
              ))}
            </ul>
            <Button onClick={() => setPhase("examples")}>Continue to Examples</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (phase === "examples") {
    return (
      <div className="space-y-4">
        {backLink}
        <Card>
          <CardContent className="space-y-4 p-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-50">Worked Examples</h2>
            {plan.examples.map((ex, i) => (
              <div key={i} className="rounded-2xl border border-gray-100 p-4 dark:border-gray-800">
                <p className="text-sm font-semibold text-gray-900 dark:text-gray-50">
                  {i + 1}. {ex.title}
                </p>
                <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">{ex.problem}</p>
                <ol className="mt-3 space-y-1.5 border-l-2 border-primary-100 pl-4 dark:border-primary-900">
                  {ex.steps.map((s, j) => (
                    <li key={j} className="text-xs text-gray-500 dark:text-gray-400">
                      <span className="font-medium text-gray-700 dark:text-gray-200">Step {j + 1}:</span> {s}
                    </li>
                  ))}
                </ol>
                <p className="mt-3 rounded-xl bg-success-50 px-3 py-2 text-sm font-medium text-success-700 dark:bg-success-900/20 dark:text-success-400">
                  Answer: {ex.answer}
                </p>
              </div>
            ))}
            <Button onClick={() => setPhase("quiz")}>Start Practice Questions</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (phase === "complete") {
    return (
      <div className="space-y-4">
        {backLink}
        <LessonSummary results={results} xpEarned={xpEarned} topicName={topicName} subjectSlug={subjectSlug} topicSlug={topicSlug} />
      </div>
    );
  }

  // phase === "quiz"
  const bloomStageTitle: Record<number, string> = {
    1: "Recall Questions",
    2: "Understanding Questions",
    3: "Application Questions",
    4: "Analytical Questions",
  };

  return (
    <div className="space-y-4">
      {backLink}
      <Card>
        <CardContent className="space-y-5 p-6">
          <LessonProgressBar currentLevel={question.bloomLevel} questionsDone={qIndex} questionsTotal={plan.questions.length} />

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-primary-500">{bloomStageTitle[question.bloomLevel]}</p>
            <p className="mt-1.5 text-base font-medium text-gray-900 dark:text-gray-50">{question.prompt}</p>
          </div>

          <LessonQuestionCard
            question={question}
            value={answer}
            onChange={setAnswer}
            disabled={status !== "answering"}
            revealCorrectness={status === "correct" ? "correct" : status === "incorrect" ? "incorrect" : null}
          />

          {status === "answering" && (
            <Button onClick={handleSubmit} disabled={!answer.trim()}>
              Submit Answer
            </Button>
          )}

          {status === "reteach" && <ReteachCard text={question.reteach} hint={question.hint} onRetry={handleRetry} />}

          {(status === "correct" || status === "incorrect") && (
            <div
              className={
                status === "correct"
                  ? "rounded-2xl border border-success-200 bg-success-50 p-4 dark:border-success-900/40 dark:bg-success-900/10"
                  : "rounded-2xl border border-red-200 bg-red-50 p-4 dark:border-red-900/40 dark:bg-red-900/10"
              }
            >
              <div className="flex items-start gap-2">
                {status === "correct" ? (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success-600 dark:text-success-400" />
                ) : (
                  <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
                )}
                <div>
                  <p className={status === "correct" ? "text-sm font-semibold text-success-800 dark:text-success-300" : "text-sm font-semibold text-red-800 dark:text-red-300"}>
                    {status === "correct" ? "Correct!" : `Not quite — the correct answer is: ${question.correctAnswer}`}
                  </p>
                  <p className={status === "correct" ? "mt-1 text-sm text-success-800/90 dark:text-success-300/90" : "mt-1 text-sm text-red-800/90 dark:text-red-300/90"}>
                    {question.explanation}
                  </p>
                </div>
              </div>
              <Button size="sm" className="mt-3" onClick={handleContinue}>
                {qIndex + 1 >= plan.questions.length ? "Finish Lesson" : "Continue"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
