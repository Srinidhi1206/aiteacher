import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import type { StudentPerformanceRow } from "@/lib/actions/teacher-analytics";

function initialsFor(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("") || "?";
}

export function StudentAnalyticsTable({ rows }: { rows: StudentPerformanceRow[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Student Performance</CardTitle>
        <CardDescription className="hidden sm:block">Real performance for this class &amp; subject, from your own exams</CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        {rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-gray-400">No students in this class yet.</p>
        ) : (
          <table className="w-full min-w-[680px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-xs uppercase tracking-wide text-gray-400 dark:border-gray-800">
                <th className="py-2 pr-3 font-medium">Student</th>
                <th className="py-2 pr-3 font-medium">Avg Score</th>
                <th className="py-2 pr-3 font-medium">Exams Attempted</th>
                <th className="py-2 pr-3 font-medium">Completion</th>
                <th className="py-2 pr-3 font-medium">Weak Topics</th>
                <th className="py-2 pr-3 font-medium">Strengths</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.studentId} className="border-b border-gray-50 last:border-0 dark:border-gray-800/60">
                  <td className="py-2.5 pr-3">
                    <div className="flex items-center gap-2">
                      <Avatar initials={initialsFor(s.name)} size="sm" />
                      <span className="font-medium text-gray-800 dark:text-gray-100">{s.name}</span>
                    </div>
                  </td>
                  <td className="py-2.5 pr-3">
                    {s.averageScorePct != null ? (
                      <span className="font-semibold text-gray-800 dark:text-gray-100">{s.averageScorePct}%</span>
                    ) : (
                      <span className="text-xs text-gray-400">No graded activity yet</span>
                    )}
                  </td>
                  <td className="py-2.5 pr-3 text-gray-500 dark:text-gray-400">{s.examsAttempted}</td>
                  <td className="py-2.5 pr-3 text-gray-500 dark:text-gray-400">{s.completionPct != null ? `${s.completionPct}%` : "N/A"}</td>
                  <td className="py-2.5 pr-3">
                    {s.weakTopicCount > 0 ? <Badge variant="warning">{s.weakTopicCount}</Badge> : <span className="text-xs text-gray-400">None</span>}
                  </td>
                  <td className="py-2.5 pr-3">
                    {s.strengthCount > 0 ? <Badge variant="success">{s.strengthCount}</Badge> : <span className="text-xs text-gray-400">None</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}
