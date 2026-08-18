import Link from "next/link";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { practiceTests } from "@/lib/mock-data/practice-papers";

export function PracticeTestsCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Practice Tests</CardTitle>
        <Link href="/practice-papers" className="text-xs font-medium text-primary-600 hover:underline dark:text-primary-400">
          View all
        </Link>
      </CardHeader>
      <CardContent className="space-y-3">
        {practiceTests.slice(0, 5).map((pt) => (
          <div key={pt.id} className="flex items-center justify-between gap-2 rounded-xl border border-gray-100 p-3 dark:border-gray-800">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-gray-800 dark:text-gray-100">{pt.title}</p>
              <p className="text-xs text-gray-400">
                {pt.subject} - {pt.questionCount} questions - {pt.durationMinutes} min
              </p>
            </div>
            {pt.status === "completed" && pt.score !== undefined ? (
              <Badge variant={pt.score / pt.maxScore >= 0.8 ? "success" : "warning"} className="shrink-0">
                {pt.score}/{pt.maxScore}
              </Badge>
            ) : (
              <Badge variant="outline" className="shrink-0">
                Not started
              </Badge>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
