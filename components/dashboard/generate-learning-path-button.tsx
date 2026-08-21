"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { regenerateMyLearningPath } from "@/lib/actions/analytics";

export function GenerateLearningPathButton() {
  const router = useRouter();
  const [loading, setLoading] = React.useState(false);

  async function handleClick() {
    setLoading(true);
    await regenerateMyLearningPath();
    setLoading(false);
    router.refresh();
  }

  return (
    <Button size="sm" onClick={handleClick} disabled={loading} className="gap-1.5">
      <Sparkles className="h-3.5 w-3.5" /> {loading ? "Generating..." : "Generate my learning path"}
    </Button>
  );
}
