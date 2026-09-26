"use client";
// The student's real assignments: the published worksheets their teachers
// created for their own school + class (listWorksheetsForStudent), with their
// own submission state. Status is derived from the real submission row, never
// stored client-side, so it survives a reload and a re-login.
import * as React from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, FileText, ClipboardCheck } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { formatDate } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { submitWorksheet, type listWorksheetsForStudent } from "@/lib/actions/worksheets";

type Row = Awaited<ReturnType<typeof listWorksheetsForStudent>>[number];
type Status = "pending" | "overdue" | "submitted" | "graded";

const filters: { label: string; value: Status | "all" | "todo" }[] = [
  { label: "All", value: "all" },
  { label: "To do", value: "todo" },
  { label: "Submitted", value: "submitted" },
  { label: "Graded", value: "graded" },
];

const statusVariant: Record<Status, "warning" | "danger" | "primary" | "success"> = {
  pending: "warning",
  overdue: "danger",
  submitted: "primary",
  graded: "success",
};

function statusOf(w: Row): Status {
  const sub = w.submissions[0];
  if (sub?.score != null) return "graded";
  if (sub?.submittedAt) return "submitted";
  if (w.dueDate) {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    if (new Date(w.dueDate) < startOfToday) return "overdue";
  }
  return "pending";
}

export function RealAssignmentsView({ assignments }: { assignments: Row[] }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [filter, setFilter] = React.useState<Status | "all" | "todo">("all");
  const [busyId, setBusyId] = React.useState<string | null>(null);

  const withStatus = assignments.map((w) => ({ w, status: statusOf(w) }));
  const todoCount = withStatus.filter((x) => x.status === "pending" || x.status === "overdue").length;
  const visible = withStatus.filter((x) =>
    filter === "all" ? true : filter === "todo" ? x.status === "pending" || x.status === "overdue" : x.status === filter
  );

  async function handleSubmit(w: Row) {
    setBusyId(w.id);
    const res = await submitWorksheet(w.id);
    setBusyId(null);
    if (!res.ok) {
      showToast("Could not submit", res.error ?? "Please try again.");
      return;
    }
    showToast("Submitted", `"${w.title}" was handed in to your teacher.`);
    router.refresh();
  }

  if (assignments.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
          <ClipboardCheck className="h-8 w-8 text-gray-300 dark:text-gray-600" />
          <p className="max-w-sm text-sm text-gray-500 dark:text-gray-400">
            No assignments yet. When a teacher at your school publishes one for your class, it will appear here.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            <span className="font-semibold text-gray-900 dark:text-gray-50">{todoCount}</span> assignment{todoCount === 1 ? "" : "s"} still to hand in.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {filters.map((f) => (
              <button
                key={f.value}
                onClick={() => setFilter(f.value)}
                className={cn(
                  "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                  filter === f.value
                    ? "bg-primary-100 text-primary-700 dark:bg-primary-950 dark:text-primary-300"
                    : "text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {visible.length === 0 ? (
        <p className="py-8 text-center text-sm text-gray-400">Nothing in this view.</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {visible.map(({ w, status }) => {
            const sub = w.submissions[0];
            return (
              <Card key={w.id}>
                <CardContent className="space-y-3 p-5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-900 dark:text-gray-50">{w.title}</p>
                      <p className="mt-0.5 text-xs text-gray-400">
                        {w.subject.name}
                        {w.chapter ? ` - ${w.chapter.name}` : ""}
                      </p>
                    </div>
                    <Badge variant={statusVariant[status]} className="shrink-0 capitalize">
                      {status}
                    </Badge>
                  </div>

                  {w.description && <p className="text-xs text-gray-500 dark:text-gray-400">{w.description}</p>}

                  {w.fileUrl && (
                    <a
                      href={w.fileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-primary-600 hover:underline dark:text-primary-300"
                    >
                      <FileText className="h-3.5 w-3.5" /> Open worksheet <ExternalLink className="h-3 w-3" />
                    </a>
                  )}

                  {status === "graded" && sub && (
                    <div className="rounded-lg bg-success-50 p-3 text-xs dark:bg-success-900/20">
                      <p className="font-semibold text-success-700 dark:text-success-400">
                        Scored {sub.score}/{sub.maxScore}
                      </p>
                      {sub.feedback && <p className="mt-1 text-gray-600 dark:text-gray-300">{sub.feedback}</p>}
                    </div>
                  )}

                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-gray-400">
                      {w.dueDate ? `Due ${formatDate(w.dueDate)}` : "No due date"}
                      {sub?.submittedAt ? ` - handed in ${formatDate(sub.submittedAt)}` : ""}
                    </span>
                    {(status === "pending" || status === "overdue") && (
                      <Button size="sm" variant={status === "overdue" ? "danger" : "primary"} disabled={busyId === w.id} onClick={() => handleSubmit(w)}>
                        {busyId === w.id ? "Submitting..." : "Mark as submitted"}
                      </Button>
                    )}
                    {status === "submitted" && <Badge variant="outline">Awaiting grading</Badge>}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
