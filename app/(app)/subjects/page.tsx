// The student's real subjects: the SchoolClassSubject links of their own
// class from the database (lib/actions/student-curriculum.ts), replacing the
// built-in sample subjects.
import Link from "next/link";
import { BookOpen, ArrowRight, Library } from "lucide-react";
import { Topbar } from "@/components/layout/topbar";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { DatabaseUnavailable } from "@/components/database-unavailable";
import { getMySubjects } from "@/lib/actions/student-curriculum";

export default async function Page() {
  let data: Awaited<ReturnType<typeof getMySubjects>>;
  try {
    data = await getMySubjects();
  } catch {
    return (
      <>
        <Topbar title="Subjects" />
        <main className="flex-1 p-4 sm:p-6">
          <DatabaseUnavailable what="Your subjects" />
        </main>
      </>
    );
  }

  return (
    <>
      <Topbar title="Subjects" />
      <main className="flex-1 space-y-4 p-4 sm:p-6">
        {data.classLabel && (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Your subjects for {data.classLabel}
            {data.boardName ? ` - ${data.boardName}` : ""}. Pick one to see its chapters, topics and the study materials your school has shared.
          </p>
        )}

        {data.subjects.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
              <BookOpen className="h-8 w-8 text-gray-300 dark:text-gray-600" />
              <p className="max-w-sm text-sm text-gray-500 dark:text-gray-400">
                {data.classLabel
                  ? "No subjects have been set up for your class yet. Ask your school administrator."
                  : "You have not been placed in a class yet. Ask your school administrator."}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {data.subjects.map((s) => (
              <Card key={s.id} className="flex flex-col transition-shadow hover:shadow-card">
                <CardContent className="flex flex-1 flex-col gap-3 p-5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary-100 text-primary-600 dark:bg-primary-950 dark:text-primary-300">
                      <BookOpen className="h-5 w-5" />
                    </div>
                    {s.progress !== null && <span className="text-xl font-bold text-gray-900 dark:text-gray-50">{s.progress}%</span>}
                  </div>
                  <div>
                    <h3 className="text-base font-semibold text-gray-900 dark:text-gray-50">{s.name}</h3>
                    <p className="mt-0.5 text-xs text-gray-400">
                      {s.chapterCount > 0 ? `${s.chapterCount} chapters - ${s.topicCount} topics` : "No chapters added yet"}
                    </p>
                    {s.materialCount > 0 && (
                      <p className="mt-0.5 flex items-center gap-1 text-xs text-gray-400">
                        <Library className="h-3.5 w-3.5" /> {s.materialCount} study material{s.materialCount === 1 ? "" : "s"}
                      </p>
                    )}
                  </div>
                  {s.progress !== null && <Progress value={s.progress} barClassName="bg-primary-500" />}
                  <Link
                    href={`/subjects/${s.id}`}
                    className="mt-auto inline-flex h-8 items-center gap-1.5 self-start rounded-xl bg-primary-50 px-3 text-sm font-medium text-primary-700 transition-colors hover:bg-primary-100 dark:bg-primary-950 dark:text-primary-300 dark:hover:bg-primary-900"
                  >
                    View chapters <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
    </>
  );
}
