"use client";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
import { monthlyProgress } from "@/lib/mock-data/progress";

export function MonthlyProgressChart() {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={monthlyProgress} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-gray-100 dark:stroke-gray-800" />
        <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "#9ca3af" }} />
        <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "#9ca3af" }} width={32} />
        <Tooltip
          contentStyle={{ borderRadius: 12, border: "1px solid #e5e7eb", fontSize: 13 }}
          formatter={(value: number, name: string) => [name === "score" ? `${value}%` : `${value}h`, name === "score" ? "Avg Score" : "Hours Studied"]}
        />
        <Bar dataKey="score" fill="#22c55e" radius={[8, 8, 0, 0]} maxBarSize={28} />
      </BarChart>
    </ResponsiveContainer>
  );
}
