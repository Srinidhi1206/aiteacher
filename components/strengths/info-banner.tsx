import { Award } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

// Mirrors components/weak-areas/detection-banner.tsx - describes the real
// deterministic algorithm (lib/analytics/strengths.ts), not an AI judgment.
export function StrengthsInfoBanner() {
  return (
    <Card className="border-success-100 bg-success-50/60 dark:border-success-900 dark:bg-success-950/30">
      <CardContent className="flex items-start gap-3 p-5">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-success-100 text-success-600 dark:bg-success-900 dark:text-success-300">
          <Award className="h-5 w-5" />
        </div>
        <div>
          <p className="text-sm font-semibold text-gray-900 dark:text-gray-50">How strengths are calculated</p>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
            A topic is flagged as a strength when your average mastery on it is 80% or higher, based on at least 3
            graded exam answers tagged to that topic - never off one good result. This is a deterministic
            calculation over your real graded answers, and updates automatically as you keep practicing.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
