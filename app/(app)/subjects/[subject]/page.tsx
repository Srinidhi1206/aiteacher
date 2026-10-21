// A real subject from the student's own class: its chapters, topics, the
// student's recorded progress on each topic, and the published materials their
// school filed under each chapter (lib/actions/student-curriculum.ts). A
// subject id that is not in the student's own class is a 404, same as a
// missing one.
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, BookOpen, ChevronRight, Sparkles } from "lucide-react";
import { Topbar } from "@/components/layout/topbar";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DatabaseUnavailable } from "@/components/database-unavailable";
import { MaterialLinks } from "@/components/subjects/material-links";
import { getMySubject } from "@/lib/actions/student-curriculum";
import { chapterAnchor } from "@/lib/study-plan/task-links";
import { CHAPTER_PARAM, parseChapterScope, scopeChapters } from "@/lib/study-plan/chapter-scope";

const statusLabel = { WEAK: "Needs work", DEVELOPING: "In progress", STRONG: "Mastered" } as const;
const statusVariant = { WEAK: "warning", DEVELOPING: "default", STRONG: "success" } as const;

// `?chapter=<chapterId>` (repeatable) narrows the page to those chapters - the Study Plan's "Chapters & materials" link for a task about one chapter uses it (lib/study-plan/chapter-scope.ts). With no such parameter
// every chapter is shown, exactly as before. The scope is in the URL, so a refresh or a shared link keeps it.
export default async function SubjectDetailPage({ params, searchParams }: { params: { subject: string }; searchParams?: { chapter?: string | string[] } }) {
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
  const scope = scopeChapters(subject.chapters, parseChapterScope(searchParams?.[CHAPTER_PARAM]));

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
              {scope.scoped ? `Showing ${scope.shown.length} of ${subject.chapters.length} chapters` : `${subject.chapters.length} chapter${subject.chapters.length === 1 ? "" : "s"}`}
            </p>
            {scope.scoped && (
              <Link href={`/subjects/${subject.id}`} className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-primary-600 hover:underline dark:text-primary-300">
                Show all {subject.chapters.length} chapters
              </Link>
            )}
            {!scope.scoped && scope.unknownIds.length > 0 && (
              <p role="status" className="mt-2 rounded-lg bg-warning-50 px-3 py-2 text-sm text-warning-700 dark:bg-warning-900/20 dark:text-warning-300">
                That link named a chapter this subject does not have, so every chapter is shown instead.
              </p>
            )}
            <Link
              href={`/ai-tutor?prefill=${encodeURIComponent(`Help me with ${subject.name}${subject.classLabel ? ` (${subject.classLabel})` : ""}.`)}`}
              className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-primary-600 hover:underline dark:text-primary-300"
            >
              <Sparkles className="h-4 w-4" /> Ask the AI Tutor about {subject.name}
            </Link>
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
            {scope.shown.map(({ chapter, number }) => (
              <Card key={chapter.id} id={chapterAnchor(chapter.id)} className="scroll-mt-20">
                <CardContent className="p-0">
                  {/* A chapter opens and closes; it is open by default so a link to it (the Study Plan's "Open chapter") lands on its topics. */}
                  <details open>
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-5">
                      <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-50">
                        <span className="mr-2 text-gray-400">{number}.</span>
                        {chapter.name}
                      </h3>
                      <span className="shrink-0 text-xs text-gray-400">{chapter.topics.length === 0 ? "Studied as one unit" : `${chapter.topics.length} topic${chapter.topics.length === 1 ? "" : "s"}`}</span>
                    </summary>
                    <div className="space-y-3 px-5 pb-5">
                      {chapter.textbook && (
                        <a
                          href={`${chapter.textbook.fileUrl}#page=${chapter.textbook.page}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 text-sm font-medium text-primary-600 hover:underline dark:text-primary-300"
                        >
                          <BookOpen className="h-4 w-4" /> Open the textbook at page {chapter.textbook.page}
                        </a>
                      )}
                      {chapter.topics.length > 0 ? (
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
                      ) : (
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          No topics have been added for this chapter yet.{chapter.textbook ? "" : " Use the textbook and materials for this subject."}
                        </p>
                      )}
                      {chapter.materials.length > 0 && (
                        <div>
                          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-400">Study materials</p>
                          <MaterialLinks materials={chapter.materials} />
                        </div>
                      )}
                    </div>
                  </details>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
    </>
  );
}
