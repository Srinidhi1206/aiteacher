import { SkillRadarPoint, SubjectPerformanceRow, BloomSubjectProgress, PerformanceStat } from "@/lib/types";
import { subjects } from "@/lib/mock-data/subjects";

// Radar chart: one representative "skill" per subject, scored 0-100.
// Kept small (5-6 axes) so the radar stays readable.
export const skillRadar: SkillRadarPoint[] = [
  { skill: "Mathematics", subject: "Mathematics", value: 61, fullMark: 100 },
  { skill: "Physics", subject: "Physics", value: 61, fullMark: 100 },
  { skill: "Chemistry", subject: "Chemistry", value: 61, fullMark: 100 },
  { skill: "Biology", subject: "Biology", value: 72, fullMark: 100 },
  { skill: "English", subject: "English", value: 80, fullMark: 100 },
  { skill: "Problem Solving", subject: "Cross-subject", value: 66, fullMark: 100 },
];

export const subjectPerformance: SubjectPerformanceRow[] = subjects.map((s) => ({
  subject: s.name,
  color: s.color,
  completion: s.progress,
  averageScore: Math.round(
    s.chapters.flatMap((c) => c.topics).reduce((sum, t) => sum + t.mastery, 0) /
      Math.max(1, s.chapters.flatMap((c) => c.topics).length)
  ),
}));

export const bloomSubjectProgress: BloomSubjectProgress[] = subjects.map((s) => {
  const topics = s.chapters.flatMap((c) => c.topics);
  const avgFor = (level: string) => {
    const matching = topics.filter((t) => t.bloomLevel === level);
    if (!matching.length) return 0;
    return Math.round(matching.reduce((sum, t) => sum + t.mastery, 0) / matching.length);
  };
  return {
    subject: s.name,
    color: s.color,
    Remember: avgFor("Remember") || 55,
    Understand: avgFor("Understand") || 50,
    Apply: avgFor("Apply") || 45,
    Analyze: avgFor("Analyze") || 35,
  };
});

export const performanceStats: PerformanceStat[] = [
  {
    id: "completion",
    label: "Overall Completion",
    value: "67%",
    sublabel: "Across all 5 subjects",
    trend: "up",
    trendValue: "+4% this month",
    icon: "CheckCircle2",
    accent: "primary",
    sparkline: [52, 55, 58, 60, 63, 65, 67],
  },
  {
    id: "avg-score",
    label: "Average Score",
    value: "78%",
    sublabel: "Last 10 assessments",
    trend: "up",
    trendValue: "+6 pts vs last month",
    icon: "Percent",
    accent: "success",
    sparkline: [62, 68, 71, 75, 79, 76, 78],
  },
  {
    id: "velocity",
    label: "Learning Velocity",
    value: "5.2",
    sublabel: "topics mastered / week",
    trend: "up",
    trendValue: "+0.8 vs last week",
    icon: "Gauge",
    accent: "sky",
    sparkline: [3.1, 3.6, 4.0, 4.4, 4.8, 5.0, 5.2],
  },
  {
    id: "improvement",
    label: "Improvement Trend",
    value: "+22%",
    sublabel: "Score growth in 6 months",
    trend: "up",
    trendValue: "Feb 62% -> Jul 84%",
    icon: "TrendingUp",
    accent: "success",
    sparkline: [62, 68, 71, 75, 79, 84],
  },
  {
    id: "weakness-reduction",
    label: "Weakness Reduction",
    value: "38%",
    sublabel: "of flagged weak topics resolved",
    trend: "up",
    trendValue: "5 of 13 resolved this term",
    icon: "ShieldCheck",
    accent: "warning",
    sparkline: [10, 15, 20, 26, 31, 38],
  },
  {
    id: "assignment-completion",
    label: "Assignment Completion",
    value: "83%",
    sublabel: "Submitted on or before due date",
    trend: "flat",
    trendValue: "Steady vs last month",
    icon: "ClipboardCheck",
    accent: "rose",
    sparkline: [80, 78, 82, 81, 84, 83],
  },
];
