import { Topbar } from "@/components/layout/topbar";
import { PracticePapersView } from "@/components/practice-papers/practice-papers-view";

export default function Page() {
  return (
    <>
      <Topbar title="Practice Papers" />
      <main className="flex-1 p-4 sm:p-6">
        <PracticePapersView />
      </main>
    </>
  );
}
