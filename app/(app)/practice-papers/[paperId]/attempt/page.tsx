// An open practice session. Only its creator can open it (getPracticePaper
// checks ownership); an already-submitted session goes straight to its results.
import { notFound, redirect } from "next/navigation";
import { Topbar } from "@/components/layout/topbar";
import { DatabaseUnavailable } from "@/components/database-unavailable";
import { PracticeAttempt } from "@/components/practice/practice-attempt";
import { getPracticePaper } from "@/lib/actions/practice";

export default async function PracticeAttemptPage({ params }: { params: { paperId: string } }) {
  let paper: Awaited<ReturnType<typeof getPracticePaper>>;
  try {
    paper = await getPracticePaper(params.paperId);
  } catch {
    return (
      <>
        <Topbar title="Practice" />
        <main className="flex-1 p-4 sm:p-6">
          <DatabaseUnavailable what="Practice" />
        </main>
      </>
    );
  }
  if (!paper) notFound();
  if (paper.status === "submitted") redirect(`/practice-papers/${params.paperId}/results`);

  return (
    <>
      <Topbar title="Practice" />
      <main className="flex-1 p-4 sm:p-6">
        <PracticeAttempt paperId={params.paperId} title={paper.title} questions={paper.questions} />
      </main>
    </>
  );
}
