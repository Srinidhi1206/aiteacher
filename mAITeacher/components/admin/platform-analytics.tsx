import { Card } from "@/components/ui/card";
import { DynamicIcon } from "@/lib/icon-map";
import { platformStats } from "@/lib/mock-data/admin";

export function PlatformAnalytics() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {platformStats.map((stat) => (
        <Card key={stat.id} className="flex items-center gap-3 p-5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-100 text-primary-600 dark:bg-primary-950 dark:text-primary-300">
            <DynamicIcon name={stat.icon} className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400">{stat.label}</p>
            <p className="text-xl font-bold text-gray-900 dark:text-gray-50">{stat.value}</p>
            <p className="text-[11px] text-success-600 dark:text-success-400">{stat.change}</p>
          </div>
        </Card>
      ))}
    </div>
  );
}
