"use client";
import { ResponsiveContainer, AreaChart, Area } from "recharts";

const strokeByAccent: Record<string, string> = {
  primary: "#6366f1",
  success: "#22c55e",
  warning: "#f59e0b",
  rose: "#f43f5e",
  sky: "#0ea5e9",
};

export function Sparkline({ data, accent = "primary", height = 40 }: { data: number[]; accent?: string; height?: number }) {
  const chartData = data.map((value, i) => ({ i, value }));
  const color = strokeByAccent[accent] ?? strokeByAccent.primary;
  const gradientId = `sparkline-${accent}`;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={chartData} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.35} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area type="monotone" dataKey="value" stroke={color} strokeWidth={2} fill={`url(#${gradientId})`} />
      </AreaChart>
    </ResponsiveContainer>
  );
}
