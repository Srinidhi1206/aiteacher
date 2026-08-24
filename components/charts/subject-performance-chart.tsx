"use client";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell } from "recharts";
import type { SubjectPerformanceRow } from "@/lib/types";

const colorHex: Record<string, string> = {
  indigo: "#6366f1",
  sky: "#0ea5e9",
  emerald: "#10b981",
  rose: "#f43f5e",
  amber: "#f59e0b",
};

export function SubjectPerformanceChart({ data }: { data: SubjectPerformanceRow[] }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart
        data={data}
        layout="vertical"
        margin={{ top: 8, right: 24, left: 8, bottom: 0 }}
        barCategoryGap={18}
      >
        <CartesianGrid strokeDasharray="3 3" horizontal={false} className="stroke-gray-100 dark:stroke-gray-800" />
        <XAxis type="number" domain={[0, 100]} tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "#9ca3af" }} />
        <YAxis type="category" dataKey="subject" tickLine={false} axisLine={false} width={90} tick={{ fontSize: 12, fill: "#6b7280" }} />
        <Tooltip
          contentStyle={{ borderRadius: 12, border: "1px solid #e5e7eb", fontSize: 13 }}
          formatter={(value: number, name: string) => [`${value}%`, name === "completion" ? "Completion" : "Avg Score"]}
        />
        <Bar dataKey="completion" radius={[0, 8, 8, 0]} maxBarSize={16}>
          {data.map((s, i) => (
            <Cell key={i} fill={colorHex[s.color] ?? "#6366f1"} fillOpacity={0.35} />
          ))}
        </Bar>
        <Bar dataKey="averageScore" radius={[0, 8, 8, 0]} maxBarSize={16}>
          {data.map((s, i) => (
            <Cell key={i} fill={colorHex[s.color] ?? "#6366f1"} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
