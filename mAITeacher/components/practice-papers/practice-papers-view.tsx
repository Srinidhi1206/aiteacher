"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { PlusCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { PaperCard } from "@/components/practice-papers/paper-card";
import { CustomPaperGenerator } from "@/components/practice-papers/custom-paper-generator";
import { papers } from "@/lib/mock-data/papers";
import { getCustomPapers, saveCustomPaper } from "@/lib/custom-papers-store";
import { Paper, PaperType } from "@/lib/types";

const groupOrder: PaperType[] = ["Chapter Test", "Weekly Test", "Monthly Test", "Mock Exam", "Previous Pattern Paper", "Final Exam"];

export function PracticePapersView() {
  const router = useRouter();
  const [modalOpen, setModalOpen] = React.useState(false);
  const [customPapers, setCustomPapers] = React.useState<Paper[]>([]);

  React.useEffect(() => {
    setCustomPapers(getCustomPapers());
  }, []);

  function handleGenerated(paper: Paper) {
    saveCustomPaper(paper);
    setModalOpen(false);
    router.push(`/practice-papers/${paper.id}/attempt`);
  }

  return (
    <div className="space-y-8">
      {customPapers.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold text-gray-900 dark:text-gray-50">Your Custom Papers</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {customPapers.map((p) => (
              <PaperCard key={p.id} paper={p} />
            ))}
          </div>
        </section>
      )}

      {groupOrder.map((type) => {
        const group = papers.filter((p) => p.type === type);
        if (group.length === 0) return null;
        return (
          <section key={type}>
            <h2 className="mb-3 text-sm font-semibold text-gray-900 dark:text-gray-50">{type}s</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {group.map((p) => (
                <PaperCard key={p.id} paper={p} />
              ))}
            </div>
          </section>
        );
      })}

      <section>
        <h2 className="mb-3 text-sm font-semibold text-gray-900 dark:text-gray-50">Build Your Own</h2>
        <Card
          className="flex cursor-pointer items-center justify-center border-2 border-dashed border-primary-200 bg-primary-50/40 transition-colors hover:bg-primary-50 dark:border-primary-900 dark:bg-primary-950/20"
          onClick={() => setModalOpen(true)}
        >
          <CardContent className="flex flex-col items-center gap-2 p-8 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-100 text-primary-600 dark:bg-primary-900 dark:text-primary-300">
              <PlusCircle className="h-6 w-6" />
            </div>
            <p className="text-sm font-semibold text-gray-900 dark:text-gray-50">Create Custom Paper</p>
            <p className="max-w-xs text-xs text-gray-500 dark:text-gray-400">
              Choose your subject, topics, question count, difficulty, and Bloom level mix to generate a fresh paper instantly.
            </p>
          </CardContent>
        </Card>
      </section>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Create Custom Paper" description="Configure your paper and we'll generate it instantly.">
        <CustomPaperGenerator onGenerate={handleGenerated} />
      </Modal>
    </div>
  );
}
