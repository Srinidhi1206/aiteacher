import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { Card } from "@/components/ui/card";
import { DynamicIcon } from "@/lib/icon-map";
import { Sparkline } from "@/components/charts/sparkline";
import type { PerformanceStat } from "@/lib/types";
import { cn } from "@/lib/utils";

const accentClasses: Record<PerformanceStat["accent"], string> = {
  primary: "bg-primary-100 text-primary-600 dark:bg-primary-950 dark:text-primary-300",
  success: "bg-success-100 text-success-600 dark:bg-success-900/40 dark:text-success-400",
  warning: "bg-warning-100 text-warning-600 dark:bg-warning-900/40 dark:text-warning-400",
  rose: "bg-rose-100 text-rose-600 dark:bg-rose-900/40 dark:text-rose-400",
  sky: "bg-sky-100 text-sky-600 dark:bg-sky-900/40 dark:text-sky-400",
};

const trendIcon = { up: TrendingUp, down: TrendingDown, flat: Minus };
const trendColor = {
  up: "text-success-600 dark:text-success-400",
  down: "text-red-600 dark:text-red-400",
  flat: "text-gray-400",
};

export function StatCard({ stat }: { stat: PerformanceStat }) {
  const TrendIcon = trendIcon[stat.trend];
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400">{stat.label}</p>
          <p className="mt-1 text-2xl font-bold text-gray-900 dark:text-gray-50">{stat.value}</p>
        </div>
        <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", accentClasses[stat.accent])}>
          <DynamicIcon name={stat.icon} className="h-5 w-5" />
        </div>
      </div>
      <p className="mt-1 text-xs text-gray-400">{stat.sublabel}</p>
      <div className={cn("mt-2 flex items-center gap-1 text-xs font-medium", trendColor[stat.trend])}>
        <TrendIcon className="h-3.5 w-3.5" />
        <span>{stat.trendValue}</span>
      </div>
      {stat.sparkline && (
        <div className="mt-3 -mx-1">
          <Sparkline data={stat.sparkline} accent={stat.accent} />
        </div>
      )}
    </Card>
  );
}
