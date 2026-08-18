import { ClipboardEdit, Route, BookOpenCheck, BarChart3 } from "lucide-react";
import { Reveal } from "@/components/marketing/reveal";

const steps = [
  {
    icon: ClipboardEdit,
    title: "Tell us your grade & subjects",
    description: "Pick your grade, curriculum, board, and the subjects you want to focus on.",
  },
  {
    icon: Route,
    title: "AI builds your learning path",
    description: "We map your syllabus to Bloom's taxonomy and generate a personalized path from basics to mastery.",
  },
  {
    icon: BookOpenCheck,
    title: "Learn, practice, get evaluated",
    description: "Work through lessons with your Socratic AI tutor, then reinforce with adaptive practice questions.",
  },
  {
    icon: BarChart3,
    title: "Track progress & ace exams",
    description: "Watch your mastery grow on the dashboard and walk into exams knowing exactly where you stand.",
  },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" className="bg-gray-50 py-20 dark:bg-gray-900/40">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Reveal className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-gray-50 sm:text-4xl">How it works</h2>
          <p className="mt-4 text-lg text-gray-600 dark:text-gray-300">From sign-up to mastery in four simple steps.</p>
        </Reveal>

        <div className="mt-14 grid grid-cols-1 gap-8 md:grid-cols-4">
          {steps.map((step, i) => (
            <Reveal key={step.title} delay={i * 0.1} className="relative">
              <div className="flex flex-col items-center text-center md:items-start md:text-left">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-600 text-white shadow-sm shadow-primary-600/30">
                  <step.icon className="h-6 w-6" />
                </div>
                <div className="mt-4 flex items-center gap-2">
                  <span className="text-xs font-bold text-primary-400">STEP {i + 1}</span>
                </div>
                <h3 className="mt-1 font-semibold text-gray-900 dark:text-gray-50">{step.title}</h3>
                <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">{step.description}</p>
              </div>
              {i < steps.length - 1 && (
                <div className="absolute right-[-16px] top-6 hidden h-0.5 w-8 bg-gray-200 dark:bg-gray-700 md:block" />
              )}
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
