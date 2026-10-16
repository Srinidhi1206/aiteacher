"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { regenerateMyLearningPath } from "@/lib/actions/analytics";

export function GenerateLearningPathButton() {
  const router = useRouter();
  const { showToast } = useToast();
  const [loading, setLoading] = React.useState(false);

  async function handleClick() {
    setLoading(true);
    const res = await regenerateMyLearningPath().catch(() => null);
    setLoading(false);
    if (!res || !res.ok || !res.data) {
      showToast("Could not update your plan", res?.error ?? "Please try again in a moment.", "warning");
    } else {
      const { mode, created, notes } = res.data;
      showToast(
        created > 0 ? (mode === "exam-aware" ? "Study plan updated for your exams" : "General study plan updated") : "Study plan unchanged",
        notes[0] ?? (created > 0 ? `${created} task${created === 1 ? "" : "s"} scheduled. Completed tasks were kept.` : "Nothing new to schedule."),
        notes.length > 0 ? "warning" : "success"
      );
    }
    router.refresh();
  }

  return (
    <Button size="sm" onClick={handleClick} disabled={loading} className="gap-1.5">
      <Sparkles className="h-3.5 w-3.5" /> {loading ? "Generating..." : "Generate my learning path"}
    </Button>
  );
}
