import Link from "next/link";
import { ArrowRight, BookOpen } from "lucide-react";
import { Subject } from "@/lib/types";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { DynamicIcon } from "@/lib/icon-map";
import { subjectColorClasses } from "@/lib/subject-colors";

export function SubjectCard({ subject }: { subject: Subject }) {
  const colors = subjectColorClasses[subject.color] ?? subjectColorClasses.indigo;
  const chapterCount = subject.chapters.length;

  let continueHref = `/subjects/${subject.slug}`;
  for (const chapter of subject.chapters) {
    const match = chapter.topics.find((t) => t.name === subject.nextTopic);
    if (match) {
      continueHref = `/subjects/${subject.slug}/${match.slug}`;
      break;
    }
  }

  return (
    <Card className="flex flex-col transition-shadow hover:shadow-card">
      <CardContent className="flex flex-1 flex-col gap-4 p-5">
        <div className="flex items-start justify-between">
          <div className={`flex h-12 w-12 items-center justify-center rounded-2xl ${colors.soft} ${colors.text}`}>
            <DynamicIcon name={subject.icon} className="h-6 w-6" />
          </div>
          <span className="text-2xl font-bold text-gray-900 dark:text-gray-50">{subject.progress}%</span>
        </div>

        <div>
          <h3 className="text-base font-semibold text-gray-900 dark:text-gray-50">{subject.name}</h3>
          <p className="mt-0.5 flex items-center gap-1 text-xs text-gray-400">
            <BookOpen className="h-3.5 w-3.5" /> {chapterCount} chapters - Bloom level: {subject.currentBloomLevel}
          </p>
        </div>

        <Progress value={subject.progress} barClassName={colors.bar} />

        <div className="mt-auto flex items-center justify-between gap-2 pt-1">
          <Link href={`/subjects/${subject.slug}`} className="text-xs font-medium text-gray-500 hover:text-gray-800 dark:hover:text-gray-200">
            View chapters
          </Link>
          <Link
            href={continueHref}
            className="inline-flex h-8 items-center gap-1.5 rounded-xl bg-primary-50 px-3 text-sm font-medium text-primary-700 transition-colors hover:bg-primary-100 dark:bg-primary-950 dark:text-primary-300 dark:hover:bg-primary-900"
          >
            Continue learning <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
