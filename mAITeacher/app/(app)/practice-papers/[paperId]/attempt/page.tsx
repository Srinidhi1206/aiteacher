"use client";
import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Topbar } from "@/components/layout/topbar";
import { AttemptView } from "@/components/practice-papers/attempt-view";
import { findAnyPaper } from "@/lib/paper-lookup";
import { Paper } from "@/lib/types";

export default function AttemptPage() {
  const params = useParams<{ paperId: string }>();
  const [paper, setPaper] = React.useState<Paper | null | undefined>(undefined);

  React.useEffect(() => {
    setPaper(findAnyPaper(params.paperId) ?? null);
  }, [params.paperId]);

  if (paper === undefined) {
    return (
      <>
        <Topbar title="Loading paper..." />
        <main className="flex-1 p-4 sm:p-6" />
      </>
    );
  }

  if (paper === null) {
    return (
      <>
        <Topbar title="Paper Not Found" />
        <main className="flex-1 p-4 sm:p-6">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            We couldn&apos;t find that paper.{" "}
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
      <Topbar title={paper.title} />
      <main className="flex-1 p-4 sm:p-6">
        <AttemptView paper={paper} />
      </main>
    </>
  );
}
