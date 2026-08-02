"use client";
import {
  ResponsiveContainer,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import { AttemptResult } from "@/lib/types";

export function TopicRadarChart({ topicBreakdown }: { topicBreakdown: AttemptResult["topicBreakdown"] }) {
  const data = topicBreakdown.map((t) => ({
    topic: t.topic.length > 18 ? `${t.topic.slice(0, 16)}...` : t.topic,
    score: t.total ? Math.round((t.scored / t.total) * 100) : 0,
  }));

  return (
    <ResponsiveContainer width="100%" height={280}>
      <RadarChart data={data} outerRadius="70%">
        <PolarGrid className="stroke-gray-200 dark:stroke-gray-700" />
        <PolarAngleAxis dataKey="topic" tick={{ fontSize: 11, fill: "#9ca3af" }} />
        <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fontSize: 10, fill: "#9ca3af" }} />
        <Radar name="Score %" dataKey="score" stroke="#6366f1" fill="#6366f1" fillOpacity={0.35} />
        <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #e5e7eb", fontSize: 13 }} formatter={(v: number) => [`${v}%`, "Score"]} />
      </RadarChart>
    </ResponsiveContainer>
  );
}

export function BloomBarChart({ bloomBreakdown }: { bloomBreakdown: AttemptResult["bloomBreakdown"] }) {
  const data = bloomBreakdown.map((b) => ({
    label: b.label,
    score: b.total ? Math.round((b.scored / b.total) * 100) : 0,
  }));

  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-gray-100 dark:stroke-gray-800" />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "#9ca3af" }} />
        <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "#9ca3af" }} width={32} domain={[0, 100]} />
        <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #e5e7eb", fontSize: 13 }} formatter={(v: number) => [`${v}%`, "Score"]} />
        <Bar dataKey="score" fill="#6366f1" radius={[8, 8, 0, 0]} maxBarSize={40} />
      </BarChart>
    </ResponsiveContainer>
  );
}
