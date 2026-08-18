import { performanceStats } from "@/lib/mock-data/performance";
import { StatCard } from "@/components/performance/stat-card";

export function StatGrid() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {performanceStats.map((stat) => (
        <StatCard key={stat.id} stat={stat} />
      ))}
    </div>
  );
}
