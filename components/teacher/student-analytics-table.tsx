import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { studentAnalytics } from "@/lib/mock-data/teacher";

const trendIcon = { up: TrendingUp, down: TrendingDown, flat: Minus };
const trendColor = {
  up: "text-success-600 dark:text-success-400",
  down: "text-red-600 dark:text-red-400",
  flat: "text-gray-400",
};

export function StudentAnalyticsTable() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Student Analytics</CardTitle>
        <CardDescription className="hidden sm:block">Performance and weak-area summary per student</CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-left text-xs uppercase tracking-wide text-gray-400 dark:border-gray-800">
              <th className="py-2 pr-3 font-medium">Student</th>
              <th className="py-2 pr-3 font-medium">Class</th>
              <th className="py-2 pr-3 font-medium">Avg Score</th>
              <th className="py-2 pr-3 font-medium">Completion</th>
              <th className="py-2 pr-3 font-medium">Weak Areas</th>
              <th className="py-2 pr-3 font-medium">Trend</th>
            </tr>
          </thead>
          <tbody>
            {studentAnalytics.map((s) => {
              const TrendIcon = trendIcon[s.trend];
              return (
                <tr key={s.id} className="border-b border-gray-50 last:border-0 dark:border-gray-800/60">
                  <td className="py-2.5 pr-3">
                    <div className="flex items-center gap-2">
                      <Avatar initials={s.initials} size="sm" />
                      <span className="font-medium text-gray-800 dark:text-gray-100">{s.name}</span>
                    </div>
                  </td>
                  <td className="py-2.5 pr-3 text-gray-500 dark:text-gray-400">{s.className}</td>
                  <td className="py-2.5 pr-3 font-semibold text-gray-800 dark:text-gray-100">{s.avgScore}%</td>
                  <td className="py-2.5 pr-3 text-gray-500 dark:text-gray-400">{s.completion}%</td>
                  <td className="py-2.5 pr-3">
                    <div className="flex flex-wrap gap-1">
                      {s.weakAreas.map((w) => (
                        <Badge key={w} variant="warning">
                          {w}
                        </Badge>
                      ))}
                    </div>
                  </td>
                  <td className="py-2.5 pr-3">
                    <TrendIcon className={`h-4 w-4 ${trendColor[s.trend]}`} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
