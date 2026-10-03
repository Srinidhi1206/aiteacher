"use client";
// Read-only oversight of the exams and assignments teachers have set (lib/actions/admin-academics.ts). Administrators do
// not author these - teachers do, for the classes and subjects they are assigned to - so this explains where they come
// from and shows what is currently set, per school.
import * as React from "react";
import { FileEdit, ClipboardList } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DatabaseUnavailable } from "@/components/database-unavailable";
import { formatDate } from "@/lib/utils";
import { listExamsForAdmin, listAssignmentsForAdmin } from "@/lib/actions/admin-academics";

type ExamRow = Awaited<ReturnType<typeof listExamsForAdmin>>[number];
type AssignmentRow = Awaited<ReturnType<typeof listAssignmentsForAdmin>>[number];

const examVariant = { DRAFT: "warning", PUBLISHED: "success", UNPUBLISHED: "outline" } as const;

export function AcademicsOverview() {
  const [exams, setExams] = React.useState<ExamRow[] | null>(null);
  const [assignments, setAssignments] = React.useState<AssignmentRow[] | null>(null);
  const [unavailable, setUnavailable] = React.useState(false);

  React.useEffect(() => {
    Promise.all([listExamsForAdmin(), listAssignmentsForAdmin()])
      .then(([e, a]) => {
        setExams(e);
        setAssignments(a);
      })
      .catch(() => setUnavailable(true));
  }, []);

  if (unavailable) return <DatabaseUnavailable what="Exams and assignments" />;

  return (
    <div className="space-y-6">
      <p className="rounded-xl border border-gray-100 bg-white px-4 py-3 text-sm text-gray-500 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400">
        Teachers create exams and assignments for the classes and subjects they teach (set under Users &rarr; teacher &rarr; Assignments). This page shows what is currently
        set so you can oversee it; students see only what is published for their own school and class.
      </p>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileEdit className="h-4 w-4 text-primary-500" /> Exams
          </CardTitle>
          <CardDescription className="hidden sm:block">Newest first, up to 200.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {exams === null ? (
            <p className="py-6 text-center text-sm text-gray-400">Loading...</p>
          ) : exams.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-400">No exams have been created yet.</p>
          ) : (
            <table className="w-full min-w-[820px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-xs uppercase tracking-wide text-gray-400 dark:border-gray-800">
                  <th className="py-2 pr-3 font-medium">Exam</th>
                  <th className="py-2 pr-3 font-medium">School</th>
                  <th className="py-2 pr-3 font-medium">Class / subject</th>
                  <th className="py-2 pr-3 font-medium">Teacher</th>
                  <th className="py-2 pr-3 text-right font-medium">Questions</th>
                  <th className="py-2 pr-3 text-right font-medium">Submissions</th>
                  <th className="py-2 pr-3 font-medium">Status</th>
                  <th className="py-2 pr-3 font-medium">Created</th>
                </tr>
              </thead>
              <tbody>
                {exams.map((e) => (
                  <tr key={e.id} className="border-b border-gray-50 last:border-0 dark:border-gray-800/60">
                    <td className="py-2.5 pr-3 font-medium text-gray-800 dark:text-gray-100">
                      {e.title}
                      <span className="block text-xs font-normal text-gray-400">
                        {e.maxMarks} marks - {e.durationMinutes} min
                      </span>
                    </td>
                    <td className="py-2.5 pr-3 text-gray-500 dark:text-gray-400">{e.schoolName ?? "-"}</td>
                    <td className="py-2.5 pr-3 text-gray-500 dark:text-gray-400">
                      {e.boardName} {e.className} - {e.subjectName}
                    </td>
                    <td className="py-2.5 pr-3 text-gray-500 dark:text-gray-400">{e.teacherName}</td>
                    <td className="py-2.5 pr-3 text-right tabular-nums">{e.questions}</td>
                    <td className="py-2.5 pr-3 text-right tabular-nums">{e.submissions}</td>
                    <td className="py-2.5 pr-3">
                      <Badge variant={examVariant[e.status as keyof typeof examVariant] ?? "outline"}>{e.status.toLowerCase()}</Badge>
                    </td>
                    <td className="whitespace-nowrap py-2.5 pr-3 text-xs text-gray-400">{formatDate(e.createdAt.toString())}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-primary-500" /> Assignments
          </CardTitle>
          <CardDescription className="hidden sm:block">Worksheets set by teachers - what students see under Assignments.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {assignments === null ? (
            <p className="py-6 text-center text-sm text-gray-400">Loading...</p>
          ) : assignments.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-400">No assignments have been created yet.</p>
          ) : (
            <table className="w-full min-w-[820px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-xs uppercase tracking-wide text-gray-400 dark:border-gray-800">
                  <th className="py-2 pr-3 font-medium">Assignment</th>
                  <th className="py-2 pr-3 font-medium">School</th>
                  <th className="py-2 pr-3 font-medium">Class / subject</th>
                  <th className="py-2 pr-3 font-medium">Teacher</th>
                  <th className="py-2 pr-3 font-medium">Due</th>
                  <th className="py-2 pr-3 text-right font-medium">Hand-ins</th>
                  <th className="py-2 pr-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {assignments.map((a) => (
                  <tr key={a.id} className="border-b border-gray-50 last:border-0 dark:border-gray-800/60">
                    <td className="py-2.5 pr-3 font-medium text-gray-800 dark:text-gray-100">
                      {a.title}
                      {a.chapterName && <span className="block text-xs font-normal text-gray-400">{a.chapterName}</span>}
                    </td>
                    <td className="py-2.5 pr-3 text-gray-500 dark:text-gray-400">{a.schoolName ?? "-"}</td>
                    <td className="py-2.5 pr-3 text-gray-500 dark:text-gray-400">
                      {a.boardName} {a.className} - {a.subjectName}
                    </td>
                    <td className="py-2.5 pr-3 text-gray-500 dark:text-gray-400">{a.teacherName}</td>
                    <td className="whitespace-nowrap py-2.5 pr-3 text-xs text-gray-500 dark:text-gray-400">{a.dueDate ? formatDate(a.dueDate.toString()) : "No due date"}</td>
                    <td className="py-2.5 pr-3 text-right tabular-nums">{a.submissions}</td>
                    <td className="py-2.5 pr-3">
                      <Badge variant={a.isPublished ? "success" : "warning"}>{a.isPublished ? "published" : "draft"}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
