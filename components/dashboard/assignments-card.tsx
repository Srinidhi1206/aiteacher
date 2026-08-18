import Link from "next/link";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { assignments } from "@/lib/mock-data/assignments";
import { formatDate } from "@/lib/utils";

const statusVariant: Record<string, "default" | "success" | "warning" | "danger" | "primary"> = {
  pending: "warning",
  submitted: "primary",
  graded: "success",
  overdue: "danger",
};

export function AssignmentsCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Assignments</CardTitle>
        <Link href="/assignments" className="text-xs font-medium text-primary-600 hover:underline dark:text-primary-400">
          View all
        </Link>
      </CardHeader>
      <CardContent className="space-y-3">
        {assignments.slice(0, 5).map((a) => (
          <div key={a.id} className="flex items-center justify-between gap-2 rounded-xl border border-gray-100 p-3 dark:border-gray-800">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-gray-800 dark:text-gray-100">{a.title}</p>
              <p className="text-xs text-gray-400">
                {a.subject} - Due {formatDate(a.dueDate)}
                {a.score !== undefined && ` - ${a.score}/${a.maxScore}`}
              </p>
            </div>
            <Badge variant={statusVariant[a.status]} className="shrink-0 capitalize">
              {a.status}
            </Badge>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
