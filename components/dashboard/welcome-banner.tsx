"use client";
import { motion } from "framer-motion";
import { currentStudent } from "@/lib/mock-data/students";

const motivationalLines = [
  "You're building real momentum. Keep showing up.",
  "Small daily wins compound into big results.",
  "Today is a great day to master something new.",
];

export function WelcomeBanner() {
  const today = new Date("2026-07-19").toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  const firstName = currentStudent.name.split(" ")[0];

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary-600 via-primary-600 to-violet-700 p-6 text-white shadow-card sm:p-8"
    >
      <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10" />
      <div className="absolute -bottom-14 right-24 h-28 w-28 rounded-full bg-white/10" />
      <p className="text-sm font-medium text-primary-100">{today}</p>
      <h2 className="mt-1 text-2xl font-bold sm:text-3xl">Welcome back, {firstName}!</h2>
      <p className="mt-2 max-w-lg text-sm text-primary-100 sm:text-base">{motivationalLines[0]}</p>
    </motion.div>
  );
}
