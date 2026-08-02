import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { activityLogs } from "@/lib/mock-data/admin";

const levelVariant = {
  info: "outline",
  warning: "warning",
  error: "danger",
} as const;

export function LogsTable() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Activity &amp; Error Logs</CardTitle>
        <CardDescription className="hidden sm:block">Recent system events across all services</CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="w-full min-w-[600px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-left text-xs uppercase tracking-wide text-gray-400 dark:border-gray-800">
              <th className="py-2 pr-3 font-medium">Level</th>
              <th className="py-2 pr-3 font-medium">Message</th>
              <th className="py-2 pr-3 font-medium">Source</th>
              <th className="py-2 pr-3 font-medium">Time</th>
            </tr>
          </thead>
          <tbody>
            {activityLogs.map((log) => (
              <tr key={log.id} className="border-b border-gray-50 last:border-0 dark:border-gray-800/60">
                <td className="py-2.5 pr-3">
                  <Badge variant={levelVariant[log.level]} className="capitalize">{log.level}</Badge>
                </td>
                <td className="max-w-xs py-2.5 pr-3 text-gray-700 dark:text-gray-200">{log.message}</td>
                <td className="py-2.5 pr-3 font-mono text-xs text-gray-400">{log.source}</td>
                <td className="py-2.5 pr-3 text-xs text-gray-400">{log.time}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
