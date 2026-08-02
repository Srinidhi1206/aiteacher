"use client";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, PlayCircle, Sparkles, TrendingUp, Flame } from "lucide-react";
import { Button } from "@/components/ui/button";

export function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary-50 via-white to-white dark:from-primary-950/40 dark:via-gray-950 dark:to-gray-950" />
      <div className="mx-auto grid max-w-7xl grid-cols-1 items-center gap-12 px-4 py-20 sm:px-6 lg:grid-cols-2 lg:px-8 lg:py-28">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <div className="mb-5 inline-flex items-center gap-1.5 rounded-full bg-primary-50 px-3 py-1 text-xs font-semibold text-primary-700 dark:bg-primary-950 dark:text-primary-300">
            <Sparkles className="h-3.5 w-3.5" />
            Personalized learning, powered by AI
          </div>
          <h1 className="text-4xl font-bold tracking-tight text-gray-900 dark:text-gray-50 sm:text-5xl lg:text-6xl">
            An AI teacher that <span className="text-primary-600">adapts to you</span>, lesson by lesson.
          </h1>
          <p className="mt-6 max-w-xl text-lg text-gray-600 dark:text-gray-300">
            mAITeacher builds a learning path around how you actually think - guiding you from
            <span className="font-semibold text-gray-800 dark:text-gray-100"> Remember </span>
            to
            <span className="font-semibold text-gray-800 dark:text-gray-100"> Understand </span>
            to
            <span className="font-semibold text-gray-800 dark:text-gray-100"> Apply </span>
            to
            <span className="font-semibold text-gray-800 dark:text-gray-100"> Analyze</span>, using Bloom&apos;s taxonomy so mastery actually sticks.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link href="/onboarding">
              <Button size="lg" className="w-full sm:w-auto">
                Start Learning Free
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <a href="#demo">
              <Button size="lg" variant="outline" className="w-full sm:w-auto">
                <PlayCircle className="h-4 w-4" />
                Watch Demo
              </Button>
            </a>
          </div>
          <div className="mt-8 flex items-center gap-6 text-sm text-gray-500 dark:text-gray-400">
            <div className="flex items-center gap-1.5">
              <TrendingUp className="h-4 w-4 text-success-500" />
              Built for CBSE, ICSE, IB &amp; more
            </div>
            <div className="flex items-center gap-1.5">
              <Flame className="h-4 w-4 text-warning-500" />
              Duolingo-style streaks
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6, delay: 0.15 }}
          className="relative"
        >
          <div className="absolute -right-6 -top-6 h-40 w-40 rounded-full bg-primary-200/50 blur-3xl dark:bg-primary-900/30" />
          <div className="absolute -bottom-8 -left-8 h-40 w-40 rounded-full bg-success-200/50 blur-3xl dark:bg-success-900/20" />

          <div className="relative rounded-3xl border border-gray-100 bg-white p-4 shadow-card dark:border-gray-800 dark:bg-gray-900">
            <div className="flex items-center gap-2 border-b border-gray-100 pb-3 dark:border-gray-800">
              <div className="h-3 w-3 rounded-full bg-red-400" />
              <div className="h-3 w-3 rounded-full bg-amber-400" />
              <div className="h-3 w-3 rounded-full bg-success-400" />
              <span className="ml-2 text-xs font-medium text-gray-400">AI Tutor - Physics</span>
            </div>

            <div className="space-y-3 py-4">
              <div className="max-w-[85%] rounded-2xl rounded-tl-sm bg-gray-100 px-4 py-2.5 text-sm text-gray-700 dark:bg-gray-800 dark:text-gray-200">
                Why does a ball thrown upward slow down as it rises?
              </div>
              <div className="ml-auto max-w-[85%] rounded-2xl rounded-tr-sm bg-primary-600 px-4 py-2.5 text-sm text-white">
                Because gravity pulls it down?
              </div>
              <div className="max-w-[85%] rounded-2xl rounded-tl-sm bg-gray-100 px-4 py-2.5 text-sm text-gray-700 dark:bg-gray-800 dark:text-gray-200">
                Good instinct! What direction is gravity&apos;s acceleration acting, and what does that do to an upward velocity?
              </div>
            </div>

            <div className="mt-2 grid grid-cols-2 gap-3 border-t border-gray-100 pt-4 dark:border-gray-800">
              <div className="rounded-xl bg-primary-50 p-3 dark:bg-primary-950">
                <p className="text-[11px] font-medium text-primary-600 dark:text-primary-300">Bloom Level</p>
                <p className="text-sm font-semibold text-primary-800 dark:text-primary-200">Understand → Apply</p>
              </div>
              <div className="rounded-xl bg-success-50 p-3 dark:bg-success-900/20">
                <p className="text-[11px] font-medium text-success-600 dark:text-success-400">Today&apos;s XP</p>
                <p className="text-sm font-semibold text-success-800 dark:text-success-300">+120 XP</p>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
