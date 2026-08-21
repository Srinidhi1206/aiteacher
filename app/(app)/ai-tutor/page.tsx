import { Topbar } from "@/components/layout/topbar";
import { RealTutorView } from "@/components/ai-tutor/real-tutor-view";

export default function Page({ searchParams }: { searchParams: { topicId?: string; prefill?: string } }) {
  return (
    <>
      <Topbar title="AI Tutor Chat" />
      <main className="flex-1 p-4 sm:p-6">
        <RealTutorView initialTopicId={searchParams.topicId} initialPrefill={searchParams.prefill} />
      </main>
    </>
  );
}
