"use client";
import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Topbar } from "@/components/layout/topbar";
import { ResultsView } from "@/components/practice-papers/results-view";
import { findAnyPaper } from "@/lib/paper-lookup";
import { getAttempt } from "@/lib/attempt-store";
import { generateAttemptResult } from "@/lib/mock-data/papers";
import { AttemptResult } from "@/lib/types";

export default function ResultsPage() {
  const params = useParams<{ paperId: string }>();
  const [result, setResult] = React.useState<AttemptResult | null | undefined>(undefined);

  React.useEffect(() => {
    const paper = findAnyPaper(params.paperId);
    if (!paper) {
      setResult(null);
      return;
    }
    const attempt = getAttempt(params.paperId);
    const answers = attempt?.answers ?? {};
    const timeTakenSeconds = attempt?.timeTakenSeconds ?? paper.durationMinutes * 60;
    setResult(generateAttemptResult(paper, answers, timeTakenSeconds));
  }, [params.paperId]);

  if (result === undefined) {
    return (
      <>
        <Topbar title="Loading results..." />
        <main className="flex-1 p-4 sm:p-6" />
      </>
    );
  }

  if (result === null) {
    return (
      <>
        <Topbar title="Results Not Found" />
        <main className="flex-1 p-4 sm:p-6">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            We couldn&apos;t find results for this paper.{" "}
            <Link href="/practice-papers" className="font-medium text-primary-600 hover:underline dark:text-primary-400">
              Go back to Practice Papers
            </Link>
          </p>
        </main>
      </>
    );
  }

  return (
    <>
      <Topbar title="Paper Results" />
      <main className="flex-1 p-4 sm:p-6">
        <ResultsView result={result} />
      </main>
    </>
  );
}
