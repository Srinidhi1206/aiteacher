"use client";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { ResponsiveContainer, LineChart, Line } from "recharts";
import { cn } from "@/lib/utils";

type Trend = "IMPROVING" | "DECLINING" | "STABLE";

const meta: Record<Trend, { label: string; color: string; Icon: typeof TrendingUp; stroke: string }> = {
  IMPROVING: { label: "Improving", color: "text-success-600 dark:text-success-400", Icon: TrendingUp, stroke: "#22c55e" },
  DECLINING: { label: "Getting worse", color: "text-red-600 dark:text-red-400", Icon: TrendingDown, stroke: "#ef4444" },
  STABLE: { label: "Stable", color: "text-gray-500 dark:text-gray-400", Icon: Minus, stroke: "#9ca3af" },
};

export function MiniTrend({ trend, trendHistory }: { trend: Trend; trendHistory: number[] }) {
  const { label, color, Icon, stroke } = meta[trend];

  if (trendHistory.length < 2) {
    // A single data point can't show a trend line - say so rather than
    // drawing a flat line that implies more history than actually exists.
    return <span className={cn("flex items-center gap-1 text-xs font-medium", color)}><Icon className="h-3.5 w-3.5" />{label}</span>;
  }

  const data = trendHistory.map((value, i) => ({ i, value }));

  return (
    <div className="flex items-center gap-2">
      <div className="h-8 w-16 shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 2, right: 2, left: 2, bottom: 2 }}>
            <Line type="monotone" dataKey="value" stroke={stroke} strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <span className={cn("flex items-center gap-1 text-xs font-medium", color)}>
        <Icon className="h-3.5 w-3.5" />
        {label}
      </span>
    </div>
  );
}
