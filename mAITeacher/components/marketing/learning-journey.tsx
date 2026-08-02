import { Brain, Lightbulb, Wrench, Search } from "lucide-react";
import { Reveal } from "@/components/marketing/reveal";

const levels = [
  { icon: Brain, name: "Remember", description: "Recall facts, definitions, and formulas.", color: "bg-gray-500" },
  { icon: Lightbulb, name: "Understand", description: "Explain ideas and concepts in your own words.", color: "bg-sky-500" },
  { icon: Wrench, name: "Apply", description: "Use knowledge to solve new problems.", color: "bg-primary-600" },
  { icon: Search, name: "Analyze", description: "Break information into parts and see connections.", color: "bg-success-500" },
];

export function LearningJourney() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6 lg:px-8">
      <Reveal className="mx-auto max-w-2xl text-center">
        <h2 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-gray-50 sm:text-4xl">
          Your learning journey, mapped to Bloom&apos;s taxonomy
        </h2>
        <p className="mt-4 text-lg text-gray-600 dark:text-gray-300">
          Every topic moves you through four levels of mastery - not just memorization.
        </p>
      </Reveal>

      <Reveal delay={0.1} className="mt-16">
        <div className="flex flex-col gap-6 md:flex-row md:items-center md:gap-0">
          {levels.map((level, i) => (
            <div key={level.name} className="flex flex-1 flex-col items-center md:flex-row">
              <div className="flex flex-col items-center text-center">
                <div className={`flex h-16 w-16 items-center justify-center rounded-2xl text-white shadow-md ${level.color}`}>
                  <level.icon className="h-8 w-8" />
                </div>
                <h3 className="mt-3 font-semibold text-gray-900 dark:text-gray-50">{level.name}</h3>
                <p className="mt-1 max-w-[160px] text-xs text-gray-500 dark:text-gray-400">{level.description}</p>
              </div>
              {i < levels.length - 1 && (
                <div className="mx-4 hidden h-0.5 flex-1 bg-gradient-to-r from-gray-300 to-gray-200 dark:from-gray-600 dark:to-gray-800 md:block" />
              )}
            </div>
          ))}
        </div>
      </Reveal>
    </section>
  );
}
