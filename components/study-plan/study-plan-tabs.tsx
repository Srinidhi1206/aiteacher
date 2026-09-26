"use client";
// The Study Plan is the student's real learning path (lib/analytics/learning-path.ts
// via lib/actions/analytics.ts). The old "Exam Planner" tab was removed: it
// generated a sample plan from built-in subjects in the browser and saved
// nothing.
import { RealLearningPathView } from "@/components/study-plan/real-learning-path-view";
import type { getMyLearningPath, getMyWeakAreas } from "@/lib/actions/analytics";

export function StudyPlanTabs({
  learningPath,
  weakAreas,
}: {
  learningPath: Awaited<ReturnType<typeof getMyLearningPath>> | null;
  weakAreas: Awaited<ReturnType<typeof getMyWeakAreas>>;
}) {
  return <RealLearningPathView learningPath={learningPath} weakAreas={weakAreas} />;
}
