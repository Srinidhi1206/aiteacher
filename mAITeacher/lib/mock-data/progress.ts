import { ProgressPoint, MonthlyProgressPoint, HeatmapDay, WeeklyDot } from "@/lib/types";

export const weeklyProgress: ProgressPoint[] = [
  { label: "Mon", date: "2026-07-13", value: 45, xp: 120 },
  { label: "Tue", date: "2026-07-14", value: 62, xp: 180 },
  { label: "Wed", date: "2026-07-15", value: 38, xp: 95 },
  { label: "Thu", date: "2026-07-16", value: 75, xp: 210 },
  { label: "Fri", date: "2026-07-17", value: 55, xp: 150 },
  { label: "Sat", date: "2026-07-18", value: 90, xp: 260 },
  { label: "Sun", date: "2026-07-19", value: 40, xp: 110 },
];

export const monthlyProgress: MonthlyProgressPoint[] = [
  { month: "Feb", score: 62, hoursStudied: 28 },
  { month: "Mar", score: 68, hoursStudied: 34 },
  { month: "Apr", score: 71, hoursStudied: 31 },
  { month: "May", score: 75, hoursStudied: 40 },
  { month: "Jun", score: 79, hoursStudied: 45 },
  { month: "Jul", score: 84, hoursStudied: 38 },
];

// 12 weeks x 7 days of activity intensity, GitHub-style
function generateHeatmap(): HeatmapDay[] {
  const days: HeatmapDay[] = [];
  const today = new Date("2026-07-19");
  const totalDays = 84;
  // Deterministic pseudo-random pattern so it looks alive but is stable across renders
  const seedPattern = [0, 2, 3, 1, 4, 0, 2, 3, 1, 0, 4, 2, 1, 3];
  for (let i = totalDays - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const idx = i % seedPattern.length;
    const weekday = d.getDay();
    let count = seedPattern[idx];
    if (weekday === 0) count = Math.max(0, count - 2); // lighter on Sundays
    days.push({ date: d.toISOString().slice(0, 10), count: Math.min(4, count) });
  }
  return days;
}

export const learningHeatmap: HeatmapDay[] = generateHeatmap();

export const weeklyDots: WeeklyDot[] = [
  { day: "Mon", active: true },
  { day: "Tue", active: true },
  { day: "Wed", active: true },
  { day: "Thu", active: true },
  { day: "Fri", active: true },
  { day: "Sat", active: true },
  { day: "Sun", active: false, isToday: true },
];
