"use client";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { ResponsiveContainer, LineChart, Line } from "recharts";
import { cn } from "@/lib/utils";
import type { WeakConcept } from "@/lib/types";

const meta: Record<WeakConcept["trend"], { label: string; color: string; Icon: typeof TrendingUp; stroke: string }> = {
  improving: { label: "Improving", color: "text-success-600 dark:text-success-400", Icon: TrendingUp, stroke: "#22c55e" },
  declining: { label: "Getting worse", color: "text-red-600 dark:text-red-400", Icon: TrendingDown, stroke: "#ef4444" },
  stable: { label: "Stable", color: "text-gray-500 dark:text-gray-400", Icon: Minus, stroke: "#9ca3af" },
};

export function MiniTrend({ concept }: { concept: WeakConcept }) {
  const { label, color, Icon, stroke } = meta[concept.trend];
  const data = concept.trendHistory.map((value, i) => ({ i, value }));

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
