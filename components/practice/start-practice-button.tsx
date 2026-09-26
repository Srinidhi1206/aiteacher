"use client";
// Starts a real practice session for one topic (startPractice) and opens it.
// Preparing a session can take several seconds the first time a topic is
// practiced (the shared question bank may need to be filled), so it shows a
// clear working state and surfaces any failure instead of doing nothing.
import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, PenLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { startPractice } from "@/lib/actions/practice";

export function StartPracticeButton({ topicId, label = "Practice this topic", className }: { topicId: string; label?: string; className?: string }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function handleStart() {
    setBusy(true);
    setError(null);
    const res = await startPractice(topicId);
    if (!res.ok || !res.data) {
      setBusy(false);
      setError(res.error ?? "Could not start practice.");
      return;
    }
    router.push(`/practice-papers/${res.data.paperId}/attempt`);
  }

  return (
    <div className={className}>
      <Button onClick={handleStart} disabled={busy} className="gap-1.5">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <PenLine className="h-4 w-4" />}
        {busy ? "Preparing questions..." : label}
      </Button>
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
