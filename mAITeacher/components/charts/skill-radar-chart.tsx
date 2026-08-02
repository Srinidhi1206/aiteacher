"use client";
import { ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, Tooltip } from "recharts";
import { skillRadar } from "@/lib/mock-data/performance";

export function SkillRadarChart() {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <RadarChart data={skillRadar} outerRadius="75%">
        <PolarGrid className="stroke-gray-200 dark:stroke-gray-800" />
        <PolarAngleAxis dataKey="skill" tick={{ fontSize: 12, fill: "#9ca3af" }} />
        <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fontSize: 10, fill: "#9ca3af" }} tickCount={5} />
        <Tooltip
          contentStyle={{ borderRadius: 12, border: "1px solid #e5e7eb", fontSize: 13 }}
          formatter={(value: number) => [`${value}%`, "Mastery"]}
        />
        <Radar name="Mastery" dataKey="value" stroke="#6366f1" fill="#6366f1" fillOpacity={0.35} strokeWidth={2} />
      </RadarChart>
    </ResponsiveContainer>
  );
}
