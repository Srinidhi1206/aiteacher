import Link from "next/link";
import { Check } from "lucide-react";
import { Reveal } from "@/components/marketing/reveal";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const tiers = [
  {
    name: "Free",
    price: "$0",
    period: "forever",
    description: "Get started with the core AI teaching experience.",
    features: ["1 subject at a time", "Socratic AI tutor (limited daily messages)", "Basic progress tracking", "Weekly study plan"],
    cta: "Start Learning Free",
    highlighted: false,
    badge: null,
  },
  {
    name: "Pro",
    price: "$9",
    period: "/month",
    description: "The full personalized learning experience.",
    features: [
      "Unlimited subjects",
      "Unlimited AI tutor conversations",
      "Adaptive practice & mock exams",
      "Full analytics & weak-area detection",
      "Priority study plan generation",
    ],
    cta: "Coming Soon",
    highlighted: true,
    badge: "Coming Soon",
  },
  {
    name: "School / Institution",
    price: "Custom",
    period: "",
    description: "For schools and coaching centers managing many students.",
    features: [
      "Teacher & admin dashboards",
      "Bulk student onboarding",
      "Cohort-level analytics",
      "Custom curriculum mapping",
      "Dedicated support",
    ],
    cta: "Coming Soon",
    highlighted: false,
    badge: "Coming Soon",
  },
];

export function Pricing() {
  return (
    <section id="pricing" className="bg-gray-50 py-20 dark:bg-gray-900/40">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Reveal className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-gray-50 sm:text-4xl">Simple, honest pricing</h2>
          <p className="mt-4 text-lg text-gray-600 dark:text-gray-300">Start free. Upgrade when you&apos;re ready for the full experience.</p>
        </Reveal>

        <div className="mt-14 grid grid-cols-1 gap-6 lg:grid-cols-3">
          {tiers.map((tier, i) => (
            <Reveal key={tier.name} delay={i * 0.08}>
              <div
                className={cn(
                  "relative flex h-full flex-col rounded-2xl border p-7",
                  tier.highlighted
                    ? "border-primary-500 bg-white shadow-card dark:bg-gray-900"
                    : "border-gray-100 bg-white shadow-soft dark:border-gray-800 dark:bg-gray-900"
                )}
              >
                {tier.badge && (
                  <Badge variant="warning" className="absolute -top-3 right-6">
                    {tier.badge}
                  </Badge>
                )}
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-50">{tier.name}</h3>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{tier.description}</p>
                <div className="mt-5 flex items-baseline gap-1">
                  <span className="text-4xl font-bold text-gray-900 dark:text-gray-50">{tier.price}</span>
                  <span className="text-sm text-gray-400">{tier.period}</span>
                </div>
                <ul className="mt-6 flex-1 space-y-3">
                  {tier.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-300">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-success-500" />
                      {f}
                    </li>
                  ))}
                </ul>
                <Link href="/onboarding" className="mt-7">
                  <Button variant={tier.highlighted ? "primary" : "outline"} className="w-full">
                    {tier.cta}
                  </Button>
                </Link>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
