import { Sparkles, MessagesSquare, Cpu, TargetIcon, FileCheck2, LineChart, CalendarClock, Trophy } from "lucide-react";
import { Reveal } from "@/components/marketing/reveal";

const features = [
  {
    icon: Sparkles,
    title: "Personalized Lessons",
    description: "Every lesson is generated around your grade, board, and current understanding - no generic textbook pacing.",
  },
  {
    icon: MessagesSquare,
    title: "Socratic AI Tutor",
    description: "Your AI teacher asks guiding questions instead of handing you answers, so concepts truly stick.",
  },
  {
    icon: Cpu,
    title: "Adaptive Question Engine",
    description: "Difficulty adjusts in real time based on how you're performing, keeping you in the productive zone.",
  },
  {
    icon: TargetIcon,
    title: "Weakness Detection",
    description: "Continuously flags topics you're struggling with and schedules focused revision before exams.",
  },
  {
    icon: FileCheck2,
    title: "Practice Papers & Mock Exams",
    description: "Full-length mock tests modeled on your actual board exam pattern, graded instantly.",
  },
  {
    icon: LineChart,
    title: "Progress Analytics",
    description: "Visual dashboards track mastery, streaks, and scores across every subject you're studying.",
  },
  {
    icon: CalendarClock,
    title: "Study Planner",
    description: "A daily plan that balances new lessons, practice, and revision so nothing falls through the cracks.",
  },
  {
    icon: Trophy,
    title: "Gamification",
    description: "XP, levels, streaks, and badges make consistent studying feel rewarding, not like a chore.",
  },
];

export function Features() {
  return (
    <section id="features" className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
      <Reveal className="mx-auto max-w-2xl text-center">
        <h2 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-gray-50 sm:text-4xl">
          Everything you need to actually learn
        </h2>
        <p className="mt-4 text-lg text-gray-600 dark:text-gray-300">
          Not just another quiz app - a complete teaching system built around how students learn best.
        </p>
      </Reveal>

      <div className="mt-14 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {features.map((feature, i) => (
          <Reveal key={feature.title} delay={i * 0.05}>
            <div className="h-full rounded-2xl border border-gray-100 bg-white p-6 shadow-soft transition-shadow hover:shadow-card dark:border-gray-800 dark:bg-gray-900">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary-50 text-primary-600 dark:bg-primary-950 dark:text-primary-300">
                <feature.icon className="h-5 w-5" />
              </div>
              <h3 className="mt-4 font-semibold text-gray-900 dark:text-gray-50">{feature.title}</h3>
              <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">{feature.description}</p>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
