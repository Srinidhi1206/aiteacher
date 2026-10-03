// A real subject from the student's own class: its chapters, topics, the
// student's recorded progress on each topic, and the published materials their
// school filed under each chapter (lib/actions/student-curriculum.ts). A
// subject id that is not in the student's own class is a 404, same as a
// missing one.
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ChevronRight } from "lucide-react";
import { Topbar } from "@/components/layout/topbar";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DatabaseUnavailable } from "@/components/database-unavailable";
import { MaterialLinks } from "@/components/subjects/material-links";
import { getMySubject } from "@/lib/actions/student-curriculum";

const statusLabel = { WEAK: "Needs work", DEVELOPING: "In progress", STRONG: "Mastered" } as const;
const statusVariant = { WEAK: "warning", DEVELOPING: "default", STRONG: "success" } as const;

export default async function SubjectDetailPage({ params }: { params: { subject: string } }) {
  let subject: Awaited<ReturnType<typeof getMySubject>>;
  try {
    subject = await getMySubject(params.subject);
  } catch {
    return (
      <>
        <Topbar title="Subject" />
        <main className="flex-1 p-4 sm:p-6">
          <DatabaseUnavailable what="This subject" />
        </main>
      </>
    );
  }
  if (!subject) notFound();

  return (
    <>
      <Topbar title={subject.name} />
      <main className="flex-1 space-y-4 p-4 sm:p-6">
        <Link href="/subjects" className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-gray-800 dark:hover:text-gray-200">
          <ArrowLeft className="h-4 w-4" /> All subjects
        </Link>

        <Card>
          <CardContent className="p-5">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-50">{subject.name}</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {subject.classLabel ? `${subject.classLabel} - ` : ""}
              {subject.chapters.length} chapter{subject.chapters.length === 1 ? "" : "s"}
            </p>
          </CardContent>
        </Card>

        {subject.subjectMaterials.length > 0 && (
          <Card>
            <CardContent className="space-y-2 p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Textbooks and study materials for {subject.name}</p>
              <MaterialLinks materials={subject.subjectMaterials} />
            </CardContent>
          </Card>
        )}

        {subject.chapters.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-sm text-gray-500 dark:text-gray-400">
              No chapters have been added for this subject yet.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {subject.chapters.map((chapter, idx) => (
              <Card key={chapter.id}>
                <CardContent className="space-y-3 p-5">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-50">
                    <span className="mr-2 text-gray-400">{idx + 1}.</span>
                    {chapter.name}
                  </h3>
                  {chapter.topics.length > 0 && (
                    <ul className="divide-y divide-gray-100 dark:divide-gray-800">
                      {chapter.topics.map((t) => (
                        <li key={t.id}>
                          <Link
                            href={`/subjects/${subject.id}/${t.id}`}
                            className="flex items-center justify-between gap-3 py-2 text-sm text-gray-700 hover:text-primary-700 dark:text-gray-200 dark:hover:text-primary-300"
                          >
                            <span className="min-w-0 flex-1 truncate">{t.name}</span>
                            {t.status && <Badge variant={statusVariant[t.status]}>{statusLabel[t.status]}</Badge>}
                            <ChevronRight className="h-4 w-4 shrink-0 text-gray-300" />
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                  {chapter.materials.length > 0 && (
                    <div>
                      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-400">Study materials</p>
                      <MaterialLinks materials={chapter.materials} />
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
    </>
  );
}
