// The short "what this plan is based on" notes on the Study Plan page - for example "Your plan for the Half-Yearly Examination is based on the published papers
// for Mathematics. Check with your teacher whether other subjects are included." Presentational only (the notes come from lib/analytics/exam-plan.ts via
// getMyPlanCoverageNotes), so it can be rendered and tested on its own. Renders nothing when there are no notes.
import * as React from "react";
import { Info } from "lucide-react";

export function PlanNotes({ notes }: { notes: string[] }) {
  if (notes.length === 0) return null;
  return (
    <div role="note" aria-label="About this plan" data-testid="plan-notes" className="space-y-1.5 rounded-xl border border-warning-200 bg-warning-50 p-3 text-xs text-warning-800 dark:border-warning-900/50 dark:bg-warning-900/20 dark:text-warning-300">
      {notes.map((n) => (
        <p key={n} className="flex items-start gap-1.5">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" /> <span>{n}</span>
        </p>
      ))}
    </div>
  );
}
