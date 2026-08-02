"use client";
import * as React from "react";
import { ChevronDown } from "lucide-react";
import { Reveal } from "@/components/marketing/reveal";
import { cn } from "@/lib/utils";

const faqs = [
  {
    question: "How does the AI teacher actually work?",
    answer:
      "mAITeacher maps your syllabus into topics tagged by Bloom's taxonomy level, then uses a Socratic questioning style - asking guiding questions rather than giving direct answers - to help you reach each level of mastery yourself.",
  },
  {
    question: "Which subjects and boards are covered?",
    answer:
      "We currently support core subjects like Mathematics, Physics, Chemistry, Biology, and English across CBSE, ICSE, State Boards, IB, and IGCSE curricula, with more being added regularly.",
  },
  {
    question: "Is my data private and secure?",
    answer:
      "Yes. Your learning data is used only to personalize your experience and is never sold to third parties. You can request deletion of your account and data at any time.",
  },
  {
    question: "How is this different from just using ChatGPT?",
    answer:
      "General chatbots answer questions directly. mAITeacher is built specifically to teach - it tracks your mastery per topic, adapts question difficulty, follows a structured curriculum, and deliberately withholds answers to guide your thinking instead.",
  },
  {
    question: "What does the free plan include?",
    answer:
      "The Free plan gives you access to one subject at a time, a limited number of daily AI tutor messages, and basic progress tracking, so you can experience the core teaching style before upgrading.",
  },
  {
    question: "Can teachers or parents track progress?",
    answer:
      "School and Institution plans (coming soon) will include teacher and parent-facing dashboards with cohort-level analytics and progress reports.",
  },
  {
    question: "How does the weak-area detection work?",
    answer:
      "We continuously analyze your quiz and practice performance per topic. When mastery drops or a topic hasn't been revisited in a while, it's flagged and scheduled into your revision plan automatically.",
  },
  {
    question: "Do I need to install anything?",
    answer:
      "No installation needed - mAITeacher runs entirely in your browser, on desktop or mobile.",
  },
];

export function FAQ() {
  const [openIndex, setOpenIndex] = React.useState<number | null>(0);

  return (
    <section id="faq" className="mx-auto max-w-3xl px-4 py-20 sm:px-6 lg:px-8">
      <Reveal className="text-center">
        <h2 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-gray-50 sm:text-4xl">Frequently asked questions</h2>
        <p className="mt-4 text-lg text-gray-600 dark:text-gray-300">Everything you need to know before you start.</p>
      </Reveal>

      <Reveal delay={0.1} className="mt-12 space-y-3">
        {faqs.map((faq, i) => {
          const isOpen = openIndex === i;
          return (
            <div key={faq.question} className="overflow-hidden rounded-2xl border border-gray-100 bg-white dark:border-gray-800 dark:bg-gray-900">
              <button
                onClick={() => setOpenIndex(isOpen ? null : i)}
                className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
              >
                <span className="font-medium text-gray-900 dark:text-gray-50">{faq.question}</span>
                <ChevronDown className={cn("h-4 w-4 shrink-0 text-gray-400 transition-transform", isOpen && "rotate-180")} />
              </button>
              {isOpen && (
                <div className="px-5 pb-4 text-sm text-gray-500 dark:text-gray-400">{faq.answer}</div>
              )}
            </div>
          );
        })}
      </Reveal>
    </section>
  );
}
