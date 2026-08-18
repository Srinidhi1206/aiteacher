import { Topbar } from "@/components/layout/topbar";
import { AiTutorView } from "@/components/ai-tutor/ai-tutor-view";

export default function Page() {
  return (
    <>
      <Topbar title="AI Tutor Chat" />
      <main className="flex-1 p-4 sm:p-6">
        <AiTutorView />
      </main>
    </>
  );
}
