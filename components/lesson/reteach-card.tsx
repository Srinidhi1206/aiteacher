import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ReteachCard({ text, hint, onRetry }: { text: string; hint?: string; onRetry: () => void }) {
  return (
    <div className="rounded-2xl border border-warning-200 bg-warning-50 p-4 dark:border-warning-900/40 dark:bg-warning-900/10">
      <div className="flex items-start gap-2">
        <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-warning-600 dark:text-warning-400" />
        <div>
          <p className="text-sm font-semibold text-warning-800 dark:text-warning-300">Let&apos;s reteach this more simply</p>
          <p className="mt-1.5 text-sm text-warning-800/90 dark:text-warning-300/90">{text}</p>
          {hint && <p className="mt-2 text-xs italic text-warning-700/80 dark:text-warning-400/80">Hint: {hint}</p>}
        </div>
      </div>
      <Button variant="primary" size="sm" className="mt-3" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}
