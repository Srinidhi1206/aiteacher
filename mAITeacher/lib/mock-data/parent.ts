import { ParentRecommendation, StudyTimeEntry } from "@/lib/types";

export const parentRecommendations: ParentRecommendation[] = [
  {
    id: "pr-1",
    title: "Encourage 15 extra minutes on Trigonometry this week",
    detail:
      "Srinidhi's mastery in Trigonometric Equations dipped to 62% after two weeks without revision. A short nightly review would help before the Aug 5 Physics Mid Term crowds out study time.",
    priority: "high",
    subject: "Mathematics",
  },
  {
    id: "pr-2",
    title: "Celebrate the Chemistry improvement",
    detail:
      "Oxidation Numbers mastery climbed from 30% to 45% in the last two weeks - a quick word of encouragement reinforces the habit that's working.",
    priority: "low",
    subject: "Chemistry",
  },
  {
    id: "pr-3",
    title: "Check in about the overdue English essay",
    detail:
      "'The Portrait of a Lady' essay was due Jul 16 and is still marked overdue. Consider asking if she needs help planning the writing time.",
    priority: "high",
    subject: "English",
  },
  {
    id: "pr-4",
    title: "Protect sleep before the Aug 5 Physics Mid Term",
    detail:
      "The study plan schedules a mock test 2 days before the exam. Keeping bedtime consistent that week will help retention more than extra late-night cramming.",
    priority: "medium",
    subject: "Physics",
  },
];

export const parentStudyTime: StudyTimeEntry[] = [
  { day: "Mon", hours: 2.1 },
  { day: "Tue", hours: 1.8 },
  { day: "Wed", hours: 2.6 },
  { day: "Thu", hours: 1.5 },
  { day: "Fri", hours: 2.2 },
  { day: "Sat", hours: 3.4 },
  { day: "Sun", hours: 1.2 },
];
