import { Wand2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { studyPlanInputs } from "@/lib/mock-data/study-plan";

export function PlanExplainer() {
  return (
    <Card className="border-primary-100 bg-primary-50/60 dark:border-primary-900 dark:bg-primary-950/30">
      <CardContent className="p-5">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-100 text-primary-600 dark:bg-primary-900 dark:text-primary-300">
            <Wand2 className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900 dark:text-gray-50">How your plan is built</p>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
              Every day in the timeline below is generated from these inputs, combined and re-weighted whenever a new
              exam is added or a topic gets flagged weak.
            </p>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {studyPlanInputs.map((input) => (
            <div key={input.label} className="rounded-xl bg-white/70 p-3 dark:bg-gray-900/40">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-primary-600 dark:text-primary-400">
                {input.label}
              </p>
              <p className="mt-0.5 text-xs text-gray-600 dark:text-gray-300">{input.value}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
