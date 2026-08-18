"use client";
import * as React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { AssignmentCard } from "@/components/assignments/assignment-card";
import { assignments } from "@/lib/mock-data/assignments";
import { cn } from "@/lib/utils";
import type { Assignment } from "@/lib/types";

const filters: { label: string; value: Assignment["status"] | "all" }[] = [
  { label: "All", value: "all" },
  { label: "Pending", value: "pending" },
  { label: "Overdue", value: "overdue" },
  { label: "Submitted", value: "submitted" },
  { label: "Graded", value: "graded" },
];

export function AssignmentsView() {
  const [filter, setFilter] = React.useState<Assignment["status"] | "all">("all");

  const visible = filter === "all" ? assignments : assignments.filter((a) => a.status === filter);
  const pendingCount = assignments.filter((a) => a.status === "pending" || a.status === "overdue").length;

  return (
    <div className="space-y-5">
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            <span className="font-semibold text-gray-900 dark:text-gray-50">{pendingCount}</span> assignments need your
            attention right now.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {filters.map((f) => (
              <button
                key={f.value}
                onClick={() => setFilter(f.value)}
                className={cn(
                  "rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                  filter === f.value
                    ? "bg-primary-600 text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300"
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {visible.map((a) => (
          <AssignmentCard key={a.id} assignment={a} />
        ))}
      </div>
      {visible.length === 0 && (
        <p className="py-10 text-center text-sm text-gray-400">No assignments in this category.</p>
      )}
    </div>
  );
}
