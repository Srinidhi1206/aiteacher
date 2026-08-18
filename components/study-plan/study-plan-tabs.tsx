"use client";
import * as React from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { PlanExplainer } from "@/components/study-plan/plan-explainer";
import { ScheduleTimeline } from "@/components/study-plan/schedule-timeline";
import { ExamPlannerForm } from "@/components/study-plan/exam-planner-form";
import { ExamPlanResult } from "@/components/study-plan/exam-plan-result";
import type { ExamPlanOutput } from "@/lib/types";

export function StudyPlanTabs() {
  const [plan, setPlan] = React.useState<ExamPlanOutput | null>(null);

  return (
    <Tabs defaultValue="my-plan" className="space-y-6">
      <TabsList>
        <TabsTrigger value="my-plan">My Plan</TabsTrigger>
        <TabsTrigger value="exam-planner">Exam Planner</TabsTrigger>
      </TabsList>

      <TabsContent value="my-plan" className="space-y-6">
        <PlanExplainer />
        <ScheduleTimeline />
      </TabsContent>

      <TabsContent value="exam-planner" className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Build a plan for a specific exam</CardTitle>
            <CardDescription className="hidden sm:block">
              Enter the exam details and we&apos;ll generate a day-by-day study calendar, daily and weekly goals, a
              revision schedule, mock test dates, and a last-minute revision checklist.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ExamPlannerForm onGenerate={setPlan} />
          </CardContent>
        </Card>

        {plan && <ExamPlanResult plan={plan} />}
      </TabsContent>
    </Tabs>
  );
}
