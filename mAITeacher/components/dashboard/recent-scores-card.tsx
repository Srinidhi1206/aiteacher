import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { practiceTests } from "@/lib/mock-data/practice-papers";
import { cn } from "@/lib/utils";

export function RecentScoresCard() {
  const scored = practiceTests.filter((t) => t.score !== undefined);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent Scores</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {scored.map((t) => {
          const pct = Math.round((t.score! / t.maxScore) * 100);
          return (
            <div key={t.id} className="flex items-center gap-3">
              <div className="w-28 shrink-0 truncate text-xs text-gray-500 dark:text-gray-400">{t.subject}</div>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
                <div
                  className={cn("h-full rounded-full", pct >= 80 ? "bg-success-500" : pct >= 60 ? "bg-primary-500" : "bg-warning-500")}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="w-10 shrink-0 text-right text-xs font-semibold text-gray-700 dark:text-gray-300">{pct}%</span>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
