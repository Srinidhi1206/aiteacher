import { notFound } from "next/navigation";
import { Topbar } from "@/components/layout/topbar";
import { getLessonPlan } from "@/lib/mock-data/lesson-content";
import { getTopicContent } from "@/lib/mock-data/topic-content";
import { LessonFlow } from "@/components/lesson/lesson-flow";

export default function LessonPage({ params }: { params: { subject: string; topic: string } }) {
  const found = getTopicContent(params.subject, params.topic);
  const plan = getLessonPlan(params.subject, params.topic);
  if (!found || !plan) notFound();

  return (
    <>
      <Topbar title={`Lesson: ${found.topic.name}`} />
      <main className="flex-1 p-4 sm:p-6">
        <LessonFlow
          plan={plan}
          topicName={found.topic.name}
          chapterName={found.chapter.name}
          subjectName={found.subject.name}
          subjectSlug={found.subject.slug}
          topicSlug={found.topic.slug}
          recap={found.content.summary}
        />
      </main>
    </>
  );
}
