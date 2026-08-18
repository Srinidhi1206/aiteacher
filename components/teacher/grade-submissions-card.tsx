"use client";
import * as React from "react";
import { PencilLine, CheckCircle2 } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { pendingSubmissions as initialSubmissions } from "@/lib/mock-data/teacher";

export function GradeSubmissionsCard() {
  const [submissions, setSubmissions] = React.useState(initialSubmissions);
  const { showToast } = useToast();

  function setMarks(id: string, marks: number) {
    setSubmissions((prev) => prev.map((s) => (s.id === id ? { ...s, marksAwarded: marks } : s)));
  }

  function saveMarks(id: string) {
    const submission = submissions.find((s) => s.id === id);
    if (!submission || submission.marksAwarded == null) return;
    showToast("Marks saved", `${submission.studentName}: ${submission.marksAwarded}/${submission.maxMarks} on "${submission.examTitle}".`);
  }

  const remaining = submissions.filter((s) => s.marksAwarded == null).length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <PencilLine className="h-4 w-4 text-primary-500" /> Grade Submissions
        </CardTitle>
        <CardDescription className="hidden sm:block">{remaining} answer sheets awaiting marks this session</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {submissions.map((s) => (
          <div
            key={s.id}
            className="flex flex-col gap-3 rounded-xl border border-gray-100 p-3 dark:border-gray-800 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="flex items-center gap-3">
              <Avatar initials={s.initials} size="sm" />
              <div>
                <p className="text-sm font-medium text-gray-800 dark:text-gray-100">{s.studentName}</p>
                <p className="text-xs text-gray-400">
                  {s.className} - {s.subject} - {s.examTitle}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={0}
                max={s.maxMarks}
                placeholder="Marks"
                value={s.marksAwarded ?? ""}
                onChange={(e) => setMarks(s.id, Number(e.target.value))}
                className="w-20 rounded-lg border border-gray-200 bg-transparent px-2 py-1.5 text-sm text-gray-800 outline-none focus:border-primary-400 dark:border-gray-700 dark:text-gray-100"
              />
              <span className="text-xs text-gray-400">/ {s.maxMarks}</span>
              {s.marksAwarded != null ? (
                <Button size="sm" variant="outline" className="gap-1.5" onClick={() => saveMarks(s.id)}>
                  <CheckCircle2 className="h-3.5 w-3.5" /> Save
                </Button>
              ) : (
                <Badge variant="warning">Pending</Badge>
              )}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
