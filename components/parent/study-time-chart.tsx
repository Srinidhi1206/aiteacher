"use client";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
import { parentStudyTime } from "@/lib/mock-data/parent";

export function StudyTimeChart() {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={parentStudyTime} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-gray-100 dark:stroke-gray-800" />
        <XAxis dataKey="day" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "#9ca3af" }} />
        <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "#9ca3af" }} width={28} />
        <Tooltip
          contentStyle={{ borderRadius: 12, border: "1px solid #e5e7eb", fontSize: 13 }}
          formatter={(value: number) => [`${value}h`, "Study Time"]}
        />
        <Bar dataKey="hours" fill="#6366f1" radius={[8, 8, 0, 0]} maxBarSize={28} />
      </BarChart>
    </ResponsiveContainer>
  );
}
