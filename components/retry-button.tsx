"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Re-runs the current page's server data fetch - the right response to a temporary loading failure. */
export function RetryButton({ label = "Try again" }: { label?: string }) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  return (
    <Button variant="outline" size="sm" className="gap-1.5" disabled={pending} onClick={() => startTransition(() => router.refresh())}>
      <RefreshCw className={`h-3.5 w-3.5 ${pending ? "animate-spin" : ""}`} /> {pending ? "Loading..." : label}
    </Button>
  );
}
