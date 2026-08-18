"use client";
import { motion } from "framer-motion";
import { Star, Flame } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { currentStudent } from "@/lib/mock-data/students";

export function XpLevelCard() {
  const pct = Math.round((currentStudent.xp / currentStudent.xpToNextLevel) * 100);
  const remaining = currentStudent.xpToNextLevel - currentStudent.xp;

  return (
    <Card className="overflow-hidden">
      <CardContent className="relative p-6">
        <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-primary-100/60 dark:bg-primary-900/20" />
        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.4 }}
              className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary-500 to-violet-600 text-white shadow-card"
            >
              <Star className="h-8 w-8" />
            </motion.div>
            <div>
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Current Level</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-gray-50">Level {currentStudent.level}</p>
              <p className="mt-0.5 flex items-center gap-1 text-xs text-warning-600 dark:text-warning-400">
                <Flame className="h-3.5 w-3.5" /> {currentStudent.streakDays}-day streak
              </p>
            </div>
          </div>

          <div className="w-full sm:max-w-xs">
            <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
              <span>{currentStudent.xp.toLocaleString()} XP</span>
              <span>{currentStudent.xpToNextLevel.toLocaleString()} XP</span>
            </div>
            <Progress value={pct} size="lg" className="mt-1.5" />
            <p className="mt-1.5 text-xs text-gray-400">
              {remaining.toLocaleString()} XP to Level {currentStudent.level + 1}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
