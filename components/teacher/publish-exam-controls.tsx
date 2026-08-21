"use client";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { publishExam, unpublishExam } from "@/lib/actions/exams";

export function PublishExamControls({ examId, status, questionCount }: { examId: string; status: string; questionCount: number }) {
  const router = useRouter();
  const { showToast } = useToast();

  async function handlePublish() {
    const result = await publishExam(examId);
    if (result.ok) {
      showToast("Exam published", "Students in this class can now see and attempt it.");
      router.refresh();
    } else {
      showToast("Could not publish", result.error ?? "");
    }
  }

  async function handleUnpublish() {
    const result = await unpublishExam(examId);
    if (result.ok) {
      showToast("Exam unpublished", "Students can no longer start new attempts.");
      router.refresh();
    } else {
      showToast("Could not unpublish", result.error ?? "");
    }
  }

  if (status === "PUBLISHED") {
    return (
      <Button size="sm" variant="outline" onClick={handleUnpublish}>
        Unpublish
      </Button>
    );
  }

  return (
    <Button size="sm" onClick={handlePublish} disabled={questionCount === 0}>
      {questionCount === 0 ? "Add questions to publish" : "Publish Exam"}
    </Button>
  );
}
