"use client";
import { Sparkles } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { formatDate, daysUntil } from "@/lib/utils";
import type { Assignment } from "@/lib/types";

const statusVariant: Record<Assignment["status"], "default" | "success" | "warning" | "danger" | "primary"> = {
  pending: "warning",
  submitted: "primary",
  graded: "success",
  overdue: "danger",
};

export function AssignmentCard({ assignment }: { assignment: Assignment }) {
  const { showToast } = useToast();
  const days = daysUntil(assignment.dueDate);
  const dueLabel =
    assignment.status === "pending" || assignment.status === "overdue"
      ? days === 0
        ? "Due today"
        : days > 0
        ? `Due in ${days} day${days > 1 ? "s" : ""}`
        : `${Math.abs(days)} day${Math.abs(days) > 1 ? "s" : ""} overdue`
      : formatDate(assignment.dueDate);

  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-50">{assignment.title}</p>
              {assignment.personalized && (
                <span className="inline-flex items-center gap-1 rounded-full bg-primary-100 px-2 py-0.5 text-[10px] font-medium text-primary-700 dark:bg-primary-950 dark:text-primary-300">
                  <Sparkles className="h-3 w-3" /> Personalized
                </span>
              )}
            </div>
            <p className="mt-0.5 text-xs text-gray-400">{assignment.subject}</p>
          </div>
          <Badge variant={statusVariant[assignment.status]} className="shrink-0 capitalize">
            {assignment.status}
          </Badge>
        </div>

        {assignment.targetConcept && (
          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
            Targets <span className="font-medium text-gray-700 dark:text-gray-200">{assignment.targetConcept}</span>
            {assignment.bloomLevel ? ` - Level: ${assignment.bloomLevel}` : ""}
            {assignment.questionCount ? ` - ${assignment.questionCount} questions` : ""}
          </p>
        )}

        <div className="mt-3 flex items-center justify-between">
          <span className="text-xs text-gray-400">
            {dueLabel}
            {assignment.score !== undefined && ` - Scored ${assignment.score}/${assignment.maxScore}`}
          </span>
          {(assignment.status === "pending" || assignment.status === "overdue") && (
            <Button
              size="sm"
              variant={assignment.status === "overdue" ? "danger" : "primary"}
              onClick={() => showToast(`Starting "${assignment.title}"`, "Opening question view - answers autosave as you go.")}
            >
              Start
            </Button>
          )}
          {assignment.status === "submitted" && (
            <Badge variant="outline">Awaiting grading</Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
