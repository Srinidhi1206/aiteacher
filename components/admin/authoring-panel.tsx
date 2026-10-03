"use client";
// Administrators creating an exam or an assignment ON BEHALF OF a teacher: pick one of your school's teachers (the super
// administrator sees every school's), then one of the class + subject pairs that teacher is assigned to. The teacher stays
// the author; the audit log records that an administrator created it. Reuses the teacher forms - the server checks the
// administrator's school and the teacher's assignment again (lib/academics/acting.ts), so nothing here is trusted.
import * as React from "react";
import { UserCog } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CreateExamForm } from "@/components/teacher/create-exam-form";
import { CreateWorksheetForm } from "@/components/teacher/create-worksheet-form";
import { listTeachersForAuthoring } from "@/lib/actions/admin-academics";

type Teacher = Awaited<ReturnType<typeof listTeachersForAuthoring>>[number];

const selectClass = "w-full rounded-xl border border-gray-200 bg-transparent px-3 py-2 text-sm text-gray-800 outline-none focus:border-primary-400 dark:border-gray-700 dark:text-gray-100 sm:max-w-md";

export function AuthoringPanel({ onChanged }: { onChanged: () => void }) {
  const [teachers, setTeachers] = React.useState<Teacher[] | null>(null);
  const [failed, setFailed] = React.useState(false);
  const [teacherId, setTeacherId] = React.useState("");
  const [kind, setKind] = React.useState<"exam" | "assignment">("exam");

  React.useEffect(() => {
    listTeachersForAuthoring()
      .then(setTeachers)
      .catch(() => setFailed(true));
  }, []);

  const teacher = teachers?.find((t) => t.id === teacherId) ?? null;
  const multiSchool = new Set((teachers ?? []).map((t) => t.schoolName)).size > 1;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UserCog className="h-4 w-4 text-primary-500" /> Create on behalf of a teacher
        </CardTitle>
        <CardDescription className="hidden sm:block">The teacher stays the author. The change is recorded in the activity log as done by you.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {failed ? (
          <p className="text-sm text-gray-400">The teacher list couldn&apos;t be loaded right now - refresh in a moment.</p>
        ) : teachers === null ? (
          <p className="text-sm text-gray-400">Loading teachers...</p>
        ) : teachers.length === 0 ? (
          <p className="text-sm text-gray-400">There are no active teachers to create work for yet. Approve a teacher and assign them a class and subject under Users first.</p>
        ) : (
          <>
            <label className="block text-xs text-gray-500">
              Teacher
              <select className={`${selectClass} mt-1 block`} value={teacherId} onChange={(e) => setTeacherId(e.target.value)} aria-label="Teacher">
                <option value="">Choose a teacher</option>
                {teachers.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                    {multiSchool && t.schoolName ? ` - ${t.schoolName}` : ""} ({t.assignments.length} class/subject{t.assignments.length === 1 ? "" : "s"})
                  </option>
                ))}
              </select>
            </label>
            {teacher && (
              <div className="space-y-3">
                <div className="flex gap-2">
                  <Button size="sm" variant={kind === "exam" ? "primary" : "outline"} onClick={() => setKind("exam")}>
                    Exam
                  </Button>
                  <Button size="sm" variant={kind === "assignment" ? "primary" : "outline"} onClick={() => setKind("assignment")}>
                    Assignment
                  </Button>
                </div>
                {kind === "exam" ? (
                  <CreateExamForm
                    key={`exam-${teacher.id}`}
                    assignments={teacher.assignments}
                    teacherId={teacher.id}
                    detailBase="/admin/exams"
                    emptyMessage={`${teacher.name} isn't assigned to any class and subject yet. Assign them one under Users first.`}
                    onCreated={onChanged}
                  />
                ) : (
                  <CreateWorksheetForm
                    key={`ws-${teacher.id}`}
                    assignments={teacher.assignments}
                    teacherId={teacher.id}
                    emptyMessage={`${teacher.name} isn't assigned to any class and subject yet. Assign them one under Users first.`}
                    onCreated={onChanged}
                  />
                )}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
