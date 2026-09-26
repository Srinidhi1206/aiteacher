// A real topic from the student's own class: where it sits, the student's
// recorded mastery of it (if any), and the published study materials their
// school filed under it or its chapter (lib/actions/student-curriculum.ts).
// A subject/topic that is not in the student's own class is a 404.
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Topbar } from "@/components/layout/topbar";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { DatabaseUnavailable } from "@/components/database-unavailable";
import { MaterialLinks } from "@/components/subjects/material-links";
import { StartPracticeButton } from "@/components/practice/start-practice-button";
import { getMyTopic } from "@/lib/actions/student-curriculum";

const statusLabel = { WEAK: "Needs work", DEVELOPING: "In progress", STRONG: "Mastered" } as const;
const statusVariant = { WEAK: "warning", DEVELOPING: "default", STRONG: "success" } as const;

export default async function TopicDetailPage({ params }: { params: { subject: string; topic: string } }) {
  let data: Awaited<ReturnType<typeof getMyTopic>>;
  try {
    data = await getMyTopic(params.subject, params.topic);
  } catch {
    return (
      <>
        <Topbar title="Topic" />
        <main className="flex-1 p-4 sm:p-6">
          <DatabaseUnavailable what="This topic" />
        </main>
      </>
    );
  }
  if (!data) notFound();

  return (
    <>
      <Topbar title={data.topic.name} />
      <main className="flex-1 space-y-4 p-4 sm:p-6">
        <Link href={`/subjects/${data.subjectId}`} className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-gray-800 dark:hover:text-gray-200">
          <ArrowLeft className="h-4 w-4" /> {data.subjectName}
        </Link>

        <Card>
          <CardContent className="space-y-3 p-5">
            <div>
              <p className="text-xs font-medium text-gray-400">
                {data.subjectName} - {data.chapterName}
              </p>
              <h2 className="mt-0.5 text-lg font-semibold text-gray-900 dark:text-gray-50">{data.topic.name}</h2>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="capitalize">{data.topic.bloomLevel.toLowerCase()}</Badge>
                {data.status && <Badge variant={statusVariant[data.status]}>{statusLabel[data.status]}</Badge>}
              </div>
            </div>
            {data.mastery !== null ? (
              <div className="w-full sm:w-64">
                <div className="mb-1 flex items-center justify-between text-xs text-gray-400">
                  <span>Mastery</span>
                  <span className="font-semibold text-gray-600 dark:text-gray-300">{data.mastery}%</span>
                </div>
                <Progress value={data.mastery} barClassName="bg-primary-500" />
              </div>
            ) : (
              <p className="text-xs text-gray-400">No mastery recorded yet. It appears here after you take a graded exam or a practice session on this topic.</p>
            )}
            <StartPracticeButton topicId={data.topic.id} />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-2 p-5">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-50">Study materials</h3>
            {data.materials.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">Your school has not shared any materials for this topic yet.</p>
            ) : (
              <MaterialLinks materials={data.materials} />
            )}
          </CardContent>
        </Card>
      </main>
    </>
  );
}
