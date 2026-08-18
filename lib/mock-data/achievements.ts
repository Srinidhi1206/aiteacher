import { Achievement, DailyGoal, LeaderboardEntry } from "@/lib/types";

export const achievements: Achievement[] = [
  {
    id: "a1",
    title: "First Steps",
    description: "Complete your first lesson",
    icon: "Footprints",
    unlocked: true,
    unlockedDate: "2026-04-03",
    category: "milestone",
  },
  {
    id: "a2",
    title: "7-Day Streak",
    description: "Study for 7 days in a row",
    icon: "Flame",
    unlocked: true,
    unlockedDate: "2026-04-10",
    category: "streak",
  },
  {
    id: "a3",
    title: "Quick Learner",
    description: "Complete 5 lessons in a single day",
    icon: "Zap",
    unlocked: true,
    unlockedDate: "2026-06-15",
    category: "milestone",
  },
  {
    id: "a4",
    title: "Perfect Score",
    description: "Score 100% on any practice test",
    icon: "Trophy",
    unlocked: true,
    unlockedDate: "2026-06-28",
    category: "practice",
  },
  {
    id: "a5",
    title: "Master of Analysis",
    description: "Reach the Analyze level in any subject",
    icon: "BrainCircuit",
    unlocked: true,
    unlockedDate: "2026-07-05",
    category: "mastery",
  },
  {
    id: "a6",
    title: "30-Day Streak",
    description: "Study for 30 days in a row",
    icon: "Flame",
    unlocked: false,
    progress: 40,
    category: "streak",
  },
  {
    id: "a7",
    title: "Subject Champion",
    description: "Reach 100% mastery in any subject",
    icon: "Crown",
    unlocked: false,
    progress: 72,
    category: "mastery",
  },
  {
    id: "a8",
    title: "Century Club",
    description: "Complete 100 practice questions",
    icon: "Target",
    unlocked: false,
    progress: 68,
    category: "practice",
  },
  {
    id: "a9",
    title: "Study Buddy",
    description: "Invite a friend to mAITeacher",
    icon: "Users",
    unlocked: false,
    progress: 0,
    category: "social",
  },
  {
    id: "a10",
    title: "Early Bird",
    description: "Complete a study session before 7 AM",
    icon: "Sunrise",
    unlocked: true,
    unlockedDate: "2026-07-16",
    category: "milestone",
  },
  {
    id: "a11",
    title: "Bloom Level 4 Unlocked",
    description: "Reach the Analyze level in Biology or English",
    icon: "BrainCircuit",
    unlocked: true,
    unlockedDate: "2026-07-01",
    category: "mastery",
  },
  {
    id: "a12",
    title: "100 Questions Solved",
    description: "Answer 100 practice questions across all subjects",
    icon: "ListChecks",
    unlocked: false,
    progress: 84,
    category: "practice",
  },
  {
    id: "a13",
    title: "Comeback Kid",
    description: "Raise a weak topic's mastery by 20+ points in a week",
    icon: "Rocket",
    unlocked: true,
    unlockedDate: "2026-07-17",
    category: "mastery",
  },
  {
    id: "a14",
    title: "Night Owl",
    description: "Complete a study session after 9 PM",
    icon: "Moon",
    unlocked: false,
    progress: 0,
    category: "milestone",
  },
  {
    id: "a15",
    title: "Consistency Champion",
    description: "Complete every scheduled study plan task in a week",
    icon: "CalendarCheck2",
    unlocked: false,
    progress: 57,
    category: "streak",
  },
];

export const dailyGoals: DailyGoal[] = [
  { id: "dg-1", label: "Complete 2 lessons", target: 2, current: 1, unit: "lessons", xpReward: 40 },
  { id: "dg-2", label: "Answer 15 practice questions", target: 15, current: 9, unit: "questions", xpReward: 30 },
  { id: "dg-3", label: "Study for 45 minutes", target: 45, current: 45, unit: "minutes", xpReward: 25 },
  { id: "dg-4", label: "Review 1 weak topic", target: 1, current: 0, unit: "topic", xpReward: 20 },
];

// Last 35 days, with the current 12-day streak reflected as an unbroken run
// ending today (2026-07-19) and a realistic gap earlier in the month.
export function buildStreakCalendar(streakDays: number): { date: string; active: boolean }[] {
  const today = new Date("2026-07-19");
  const totalDays = 35;
  const days: { date: string; active: boolean }[] = [];
  for (let i = totalDays - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const active = i < streakDays || (i >= streakDays + 3 && i % 3 !== 0);
    days.push({ date: d.toISOString().slice(0, 10), active });
  }
  return days;
}

export const leaderboard: LeaderboardEntry[] = [
  { rank: 1, name: "Ananya Rao", initials: "AR", color: "bg-rose-500", xp: 4180 },
  { rank: 2, name: "Kabir Mehta", initials: "KM", color: "bg-sky-500", xp: 3910 },
  { rank: 3, name: "Srinidhi Akkenapally", initials: "SA", color: "bg-primary-500", xp: 3420, isCurrentUser: true },
  { rank: 4, name: "Diya Patel", initials: "DP", color: "bg-emerald-500", xp: 3260 },
  { rank: 5, name: "Arjun Nair", initials: "AN", color: "bg-amber-500", xp: 2980 },
  { rank: 6, name: "Meera Iyer", initials: "MI", color: "bg-violet-500", xp: 2745 },
];
