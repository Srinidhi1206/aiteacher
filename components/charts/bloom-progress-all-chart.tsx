"use client";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from "recharts";
import { bloomSubjectProgress } from "@/lib/mock-data/performance";

export function BloomProgressAllChart() {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={bloomSubjectProgress} margin={{ top: 8, right: 8, left: -16, bottom: 0 }} barGap={4}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-gray-100 dark:stroke-gray-800" />
        <XAxis dataKey="subject" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "#9ca3af" }} />
        <YAxis domain={[0, 100]} tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "#9ca3af" }} width={32} />
        <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #e5e7eb", fontSize: 13 }} formatter={(value: number) => [`${value}%`, ""]} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="Remember" fill="#9ca3af" radius={[4, 4, 0, 0]} maxBarSize={16} />
        <Bar dataKey="Understand" fill="#38bdf8" radius={[4, 4, 0, 0]} maxBarSize={16} />
        <Bar dataKey="Apply" fill="#6366f1" radius={[4, 4, 0, 0]} maxBarSize={16} />
        <Bar dataKey="Analyze" fill="#22c55e" radius={[4, 4, 0, 0]} maxBarSize={16} />
      </BarChart>
    </ResponsiveContainer>
  );
}
