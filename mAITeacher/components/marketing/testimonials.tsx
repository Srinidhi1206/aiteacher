import { Star } from "lucide-react";
import { Reveal } from "@/components/marketing/reveal";

const testimonials = [
  {
    name: "Ananya Rao",
    meta: "Class 12, CBSE",
    quote:
      "The way it breaks Physics down into small guided questions actually made numericals click for me. My unit test scores went from 60s to 80s.",
    rating: 5,
  },
  {
    name: "Rohan Mehta",
    meta: "Class 10, ICSE",
    quote:
      "I used to dread Chemistry. The AI tutor never just gives the answer - it makes me think, which honestly sticks way better.",
    rating: 5,
  },
  {
    name: "Ishaan Kapoor",
    meta: "Class 11, CBSE",
    quote:
      "The weak topics tracker is scary accurate. It flagged Conic Sections before my teacher even mentioned I was behind.",
    rating: 4,
  },
  {
    name: "Meera Nair",
    meta: "Grade 9, IB",
    quote:
      "Streaks and XP sound gimmicky but they genuinely got me to study daily instead of cramming before exams.",
    rating: 5,
  },
];

export function Testimonials() {
  return (
    <section className="bg-gray-50 py-20 dark:bg-gray-900/40">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Reveal className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-gray-50 sm:text-4xl">Loved by students</h2>
          <p className="mt-4 text-lg text-gray-600 dark:text-gray-300">Real feedback from students building real study habits.</p>
        </Reveal>

        <div className="mt-14 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {testimonials.map((t, i) => (
            <Reveal key={t.name} delay={i * 0.08}>
              <div className="flex h-full flex-col rounded-2xl border border-gray-100 bg-white p-6 shadow-soft dark:border-gray-800 dark:bg-gray-900">
                <div className="flex gap-0.5">
                  {Array.from({ length: 5 }).map((_, idx) => (
                    <Star
                      key={idx}
                      className={`h-4 w-4 ${idx < t.rating ? "fill-warning-400 text-warning-400" : "fill-gray-200 text-gray-200 dark:fill-gray-700 dark:text-gray-700"}`}
                    />
                  ))}
                </div>
                <p className="mt-4 flex-1 text-sm text-gray-600 dark:text-gray-300">&ldquo;{t.quote}&rdquo;</p>
                <div className="mt-5 flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-100 text-sm font-semibold text-primary-700 dark:bg-primary-950 dark:text-primary-300">
                    {t.name.split(" ").map((n) => n[0]).join("")}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-50">{t.name}</p>
                    <p className="text-xs text-gray-400">{t.meta}</p>
                  </div>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
