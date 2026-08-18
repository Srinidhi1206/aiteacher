import { Sparkles } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export function DetectionBanner() {
  return (
    <Card className="border-primary-100 bg-primary-50/60 dark:border-primary-900 dark:bg-primary-950/30">
      <CardContent className="flex items-start gap-3 p-5">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-100 text-primary-600 dark:bg-primary-900 dark:text-primary-300">
          <Sparkles className="h-5 w-5" />
        </div>
        <div>
          <p className="text-sm font-semibold text-gray-900 dark:text-gray-50">How we detect weak areas</p>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
            A topic is flagged weak when mastery drops below 50%, you get 2 or more wrong answers in a row on it, or
            it hasn&apos;t been revisited in 14+ days. We combine practice paper attempts, lesson quiz results, and
            time-since-last-review to compute the reason shown on each card below - so this list updates automatically
            as you keep practicing.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
