import { Sparkles } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

// Stage H: copy corrected to describe the actual deterministic algorithm
// (lib/analytics/weakness.ts) - this is arithmetic over real graded
// answers, not an AI/ML detection process.
export function DetectionBanner() {
  return (
    <Card className="border-primary-100 bg-primary-50/60 dark:border-primary-900 dark:bg-primary-950/30">
      <CardContent className="flex items-start gap-3 p-5">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-100 text-primary-600 dark:bg-primary-900 dark:text-primary-300">
          <Sparkles className="h-5 w-5" />
        </div>
        <div>
          <p className="text-sm font-semibold text-gray-900 dark:text-gray-50">How weak areas are calculated</p>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
            A topic is flagged as weak when your average mastery on it drops below 50%, based on at least 2 graded
            answers on that topic from your exams and practice - never off a single question. This is a
            deterministic calculation over your real graded answers (not an AI judgment), and updates
            automatically every time an exam is graded or you finish a practice session.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
