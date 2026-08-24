import { StatCard } from "@/components/performance/stat-card";
import type { PerformanceStat } from "@/lib/types";

export function StatGrid({ stats }: { stats: PerformanceStat[] }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {stats.map((stat) => (
        <StatCard key={stat.id} stat={stat} />
      ))}
    </div>
  );
}
