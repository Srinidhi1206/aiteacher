"use client";
// Real version (Stage H): one bar per Bloom level, since ExamAnswer/Topic
// data has no per-subject breakdown - see lib/actions/analytics.ts's
// getMyBloomPerformance and docs/STEP_3_5.md "Stage H detail" for why this
// is the topic's Bloom classification, not a per-question one. Callers
// should only pass levels that actually have answered data (percentage !=
// null) - a level with no data isn't rendered as a fake 0% bar.
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell } from "recharts";

const LEVEL_LABEL: Record<string, string> = {
  REMEMBER: "Remember",
  UNDERSTAND: "Understand",
  APPLY: "Apply",
  ANALYZE: "Analyze",
};

const LEVEL_COLOR: Record<string, string> = {
  REMEMBER: "#9ca3af",
  UNDERSTAND: "#38bdf8",
  APPLY: "#6366f1",
  ANALYZE: "#22c55e",
};

export interface BloomChartRow {
  bloomLevel: string;
  percentage: number;
  answerCount: number;
}

export function BloomProgressAllChart({ data }: { data: BloomChartRow[] }) {
  const chartData = data.map((d) => ({ ...d, label: LEVEL_LABEL[d.bloomLevel] ?? d.bloomLevel }));

  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={chartData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-gray-100 dark:stroke-gray-800" />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "#9ca3af" }} />
        <YAxis domain={[0, 100]} tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "#9ca3af" }} width={32} />
        <Tooltip
          contentStyle={{ borderRadius: 12, border: "1px solid #e5e7eb", fontSize: 13 }}
          formatter={(value: number, _name, item) => [`${value}% (${item.payload.answerCount} answers)`, "Mastery"]}
        />
        <Bar dataKey="percentage" radius={[4, 4, 0, 0]} maxBarSize={48}>
          {chartData.map((d, i) => (
            <Cell key={i} fill={LEVEL_COLOR[d.bloomLevel] ?? "#6366f1"} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
