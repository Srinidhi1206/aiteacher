"use client";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
import { weeklyProgress } from "@/lib/mock-data/progress";

export function WeeklyProgressChart() {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <LineChart data={weeklyProgress} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-gray-100 dark:stroke-gray-800" />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "#9ca3af" }} />
        <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "#9ca3af" }} width={32} />
        <Tooltip
          contentStyle={{ borderRadius: 12, border: "1px solid #e5e7eb", fontSize: 13 }}
          formatter={(value: number) => [`${value} min`, "Studied"]}
        />
        <Line
          type="monotone"
          dataKey="value"
          stroke="#6366f1"
          strokeWidth={3}
          dot={{ r: 4, fill: "#6366f1" }}
          activeDot={{ r: 6 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
