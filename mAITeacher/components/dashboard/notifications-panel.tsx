import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { notifications } from "@/lib/mock-data/notifications";
import { cn } from "@/lib/utils";

export function NotificationsPanel() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Notifications</CardTitle>
        {notifications.some((n) => !n.read) && <Badge variant="primary">{notifications.filter((n) => !n.read).length} new</Badge>}
      </CardHeader>
      <CardContent className="space-y-3">
        {notifications.slice(0, 5).map((n) => (
          <div key={n.id} className="flex items-start gap-3">
            <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", n.read ? "bg-gray-200 dark:bg-gray-700" : "bg-primary-500")} />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-gray-800 dark:text-gray-100">{n.title}</p>
              <p className="line-clamp-1 text-xs text-gray-400">{n.message}</p>
            </div>
            <span className="ml-auto shrink-0 text-[11px] text-gray-400">{n.time}</span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
