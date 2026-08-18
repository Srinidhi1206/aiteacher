import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Topbar } from "@/components/layout/topbar";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { DynamicIcon } from "@/lib/icon-map";
import { getSubjectBySlug } from "@/lib/mock-data/subjects";
import { subjectColorClasses } from "@/lib/subject-colors";
import { ChapterAccordion } from "@/components/subjects/chapter-accordion";

export default function SubjectDetailPage({ params }: { params: { subject: string } }) {
  const subject = getSubjectBySlug(params.subject);
  if (!subject) notFound();

  const colors = subjectColorClasses[subject.color] ?? subjectColorClasses.indigo;

  return (
    <>
      <Topbar title={subject.name} />
      <main className="flex-1 space-y-4 p-4 sm:p-6">
        <Link href="/subjects" className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-gray-800 dark:hover:text-gray-200">
          <ArrowLeft className="h-4 w-4" /> All subjects
        </Link>

        <Card>
          <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <div className={`flex h-14 w-14 items-center justify-center rounded-2xl ${colors.soft} ${colors.text}`}>
                <DynamicIcon name={subject.icon} className="h-7 w-7" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-50">{subject.name}</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {subject.chapters.length} chapters - Current Bloom level: {subject.currentBloomLevel}
                </p>
              </div>
            </div>
            <div className="w-full sm:w-56">
              <div className="mb-1 flex items-center justify-between text-xs text-gray-400">
                <span>Overall progress</span>
                <span className="font-semibold text-gray-600 dark:text-gray-300">{subject.progress}%</span>
              </div>
              <Progress value={subject.progress} barClassName={colors.bar} />
            </div>
          </CardContent>
        </Card>

        <div className="space-y-3">
          {subject.chapters.map((chapter, idx) => (
            <ChapterAccordion
              key={chapter.id}
              subjectSlug={subject.slug}
              chapter={chapter}
              defaultOpen={idx === 0}
              accentBar={colors.bar}
            />
          ))}
        </div>
      </main>
    </>
  );
}
