"use client";
// Stage H: real teacher analytics, scoped to the signed-in teacher's own
// TeacherAssignment rows. Distinct from the pre-existing mock
// ClassSubjectSelector above it on /teacher (that one drives the other,
// still-mock cards on this page and is left untouched) - this selector
// only ever offers class/subject pairs the teacher is actually assigned
// to, which is also what every action here re-validates server-side.
import * as React from "react";
import { BarChart3 } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { DatabaseUnavailable } from "@/components/database-unavailable";
import { StudentAnalyticsTable } from "@/components/teacher/student-analytics-table";
import { ClassWeakConceptsCard } from "@/components/teacher/class-weak-concepts-card";
import { listMyTeacherAssignments } from "@/lib/actions/exams";
import { getClassOverview, getStudentPerformanceTable, getClassTopicDifficulty, type ClassOverview, type StudentPerformanceRow, type TopicDifficultyRow } from "@/lib/actions/teacher-analytics";

type Assignment = Awaited<ReturnType<typeof listMyTeacherAssignments>>[number];

export function RealClassAnalytics() {
  const [status, setStatus] = React.useState<"loading" | "db-unavailable" | "ready">("loading");
  const [assignments, setAssignments] = React.useState<Assignment[]>([]);
  const [selected, setSelected] = React.useState<string>(""); // `${schoolClassId}:${subjectId}`
  const [overview, setOverview] = React.useState<ClassOverview | null>(null);
  const [students, setStudents] = React.useState<StudentPerformanceRow[]>([]);
  const [topics, setTopics] = React.useState<TopicDifficultyRow[]>([]);
  const [loadingScope, setLoadingScope] = React.useState(false);

  React.useEffect(() => {
    listMyTeacherAssignments()
      .then((rows) => {
        setAssignments(rows);
        setStatus("ready");
        if (rows.length > 0) setSelected(`${rows[0].schoolClassId}:${rows[0].subjectId}`);
      })
      .catch(() => setStatus("db-unavailable"));
  }, []);

  React.useEffect(() => {
    if (!selected) return;
    const [schoolClassId, subjectId] = selected.split(":");
    setLoadingScope(true);
    Promise.all([getClassOverview(schoolClassId, subjectId), getStudentPerformanceTable(schoolClassId, subjectId), getClassTopicDifficulty(schoolClassId, subjectId)])
      .then(([o, s, t]) => {
        setOverview(o);
        setStudents(s);
        setTopics(t);
      })
      .catch(() => setStatus("db-unavailable"))
      .finally(() => setLoadingScope(false));
  }, [selected]);

  if (status === "loading") return null;
  if (status === "db-unavailable") return <DatabaseUnavailable what="Class analytics" />;

  if (assignments.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
          <BarChart3 className="h-8 w-8 text-gray-300 dark:text-gray-600" />
          <p className="text-sm text-gray-500 dark:text-gray-400">
            You&apos;re not assigned to any class/subject yet - an admin needs to set this up before class analytics can show here.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-primary-500" /> Class Analytics
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-4 flex flex-wrap gap-1.5">
            {assignments.map((a) => {
              const key = `${a.schoolClassId}:${a.subjectId}`;
              return (
                <button
                  key={a.id}
                  onClick={() => setSelected(key)}
                  className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                    selected === key ? "bg-primary-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300"
                  }`}
                >
                  {a.schoolClass.label} - {a.subject.name}
                </button>
              );
            })}
          </div>

          {loadingScope || !overview ? (
            <p className="py-6 text-center text-sm text-gray-400">Loading...</p>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <Stat label="Students" value={String(overview.studentCount)} />
              <Stat label="Exams" value={String(overview.examCount)} />
              <Stat label="Avg Score" value={overview.averageScorePct != null ? `${overview.averageScorePct}%` : "N/A"} />
              <Stat label="Participation" value={overview.participationPct != null ? `${overview.participationPct}%` : "N/A"} />
              <Stat label="Completion Rate" value={overview.completionRatePct != null ? `${overview.completionRatePct}%` : "N/A"} />
              <Stat label="Submissions" value={String(overview.totalSubmissions)} />
            </div>
          )}
        </CardContent>
      </Card>

      {!loadingScope && overview && (
        <>
          <ClassWeakConceptsCard topics={topics} />
          <StudentAnalyticsTable rows={students} />
        </>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-gray-100 p-3 text-center dark:border-gray-800">
      <p className="text-lg font-bold text-gray-900 dark:text-gray-50">{value}</p>
      <p className="text-[11px] text-gray-400">{label}</p>
    </div>
  );
}
