import { AlarmClock } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { revisionAlerts } from "@/lib/mock-data/study-plan";
import { formatDate } from "@/lib/utils";

export function RevisionAlertsCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Upcoming Revision Alerts</CardTitle>
        <AlarmClock className="h-4 w-4 text-gray-400" />
      </CardHeader>
      <CardContent className="space-y-3">
        {revisionAlerts.map((r) => (
          <div key={r.id} className="flex items-start gap-3 rounded-xl border border-amber-100 bg-amber-50/50 p-3 dark:border-amber-900/30 dark:bg-amber-900/10">
            <div className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-amber-500" />
            <div>
              <p className="text-sm font-medium text-gray-800 dark:text-gray-100">
                {r.topic} <span className="text-gray-400">- {r.subject}</span>
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">{r.reason}</p>
              <p className="mt-0.5 text-[11px] font-medium text-amber-600 dark:text-amber-400">Review by {formatDate(r.dueDate)}</p>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
