import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, PlayCircle, Target } from "lucide-react";
import { Topbar } from "@/components/layout/topbar";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { BloomBadge, TopicStatusBadge } from "@/components/subjects/bloom-badge";
import { FormulaCard } from "@/components/subjects/formula-card";
import { IllustrationCard } from "@/components/subjects/illustration-card";
import { FlashcardDeck } from "@/components/subjects/flashcard-deck";
import { getTopicContent } from "@/lib/mock-data/topic-content";
import { subjectColorClasses } from "@/lib/subject-colors";

export default function TopicDetailPage({ params }: { params: { subject: string; topic: string } }) {
  const found = getTopicContent(params.subject, params.topic);
  if (!found) notFound();
  const { subject, chapter, topic, content } = found;
  const colors = subjectColorClasses[subject.color] ?? subjectColorClasses.indigo;

  return (
    <>
      <Topbar title={topic.name} />
      <main className="flex-1 space-y-4 p-4 sm:p-6">
        <Link
          href={`/subjects/${subject.slug}`}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-gray-800 dark:hover:text-gray-200"
        >
          <ArrowLeft className="h-4 w-4" /> {subject.name}
        </Link>

        <Card>
          <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-medium text-gray-400">
                {subject.name} - {chapter.name}
              </p>
              <h2 className="mt-0.5 text-lg font-semibold text-gray-900 dark:text-gray-50">{topic.name}</h2>
              <div className="mt-2 flex items-center gap-2">
                <BloomBadge level={topic.bloomLevel} />
                <TopicStatusBadge status={topic.status} />
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="w-36">
                <div className="mb-1 flex items-center justify-between text-xs text-gray-400">
                  <span>Mastery</span>
                  <span className="font-semibold text-gray-600 dark:text-gray-300">{topic.mastery}%</span>
                </div>
                <Progress value={topic.mastery} barClassName={colors.bar} />
              </div>
              <Link
                href={`/subjects/${subject.slug}/${topic.slug}/lesson`}
                className="inline-flex h-10 shrink-0 items-center gap-2 rounded-xl bg-primary-600 px-4 text-sm font-medium text-white shadow-sm shadow-primary-600/20 transition-colors hover:bg-primary-700"
              >
                <PlayCircle className="h-4 w-4" /> Start Lesson
              </Link>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <Tabs defaultValue="overview">
              <TabsList className="mb-5 flex-wrap">
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="theory">Theory</TabsTrigger>
                <TabsTrigger value="illustrations">Illustrations</TabsTrigger>
                <TabsTrigger value="examples">Examples</TabsTrigger>
                <TabsTrigger value="applications">Applications</TabsTrigger>
                <TabsTrigger value="formulae">Key Formulae</TabsTrigger>
                <TabsTrigger value="summary">Summary</TabsTrigger>
                <TabsTrigger value="flashcards">Flashcards</TabsTrigger>
                <TabsTrigger value="revision">Revision Notes</TabsTrigger>
              </TabsList>

              <TabsContent value="overview" className="space-y-4">
                <div className="flex items-start gap-2 rounded-2xl bg-gray-50 p-4 dark:bg-gray-800/50">
                  <Target className="mt-0.5 h-4 w-4 shrink-0 text-primary-500" />
                  <p className="text-sm text-gray-600 dark:text-gray-300">
                    This topic sits within <span className="font-medium text-gray-800 dark:text-gray-100">{chapter.name}</span> and
                    you&apos;re currently working at the <span className="font-medium text-gray-800 dark:text-gray-100">{topic.bloomLevel}</span> level
                    of Bloom&apos;s taxonomy.
                  </p>
                </div>
                <div>
                  <h4 className="mb-2 text-sm font-semibold text-gray-900 dark:text-gray-50">Learning Objectives</h4>
                  <ul className="space-y-2">
                    {content.objectives.map((o, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-300">
                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary-400" />
                        {o}
                      </li>
                    ))}
                  </ul>
                </div>
              </TabsContent>

              <TabsContent value="theory" className="space-y-4">
                {content.theory.map((p, i) => (
                  <p key={i} className="text-sm leading-relaxed text-gray-700 dark:text-gray-300">
                    {p}
                  </p>
                ))}
              </TabsContent>

              <TabsContent value="illustrations">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {content.illustrations.map((ill, i) => (
                    <IllustrationCard key={i} illustration={ill} />
                  ))}
                </div>
              </TabsContent>

              <TabsContent value="examples" className="space-y-4">
                {content.examples.map((ex, i) => (
                  <div key={i} className="rounded-2xl border border-gray-100 p-4 dark:border-gray-800">
                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-50">
                      {i + 1}. {ex.title}
                    </p>
                    <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">{ex.problem}</p>
                    <ol className="mt-3 space-y-1.5 border-l-2 border-primary-100 pl-4 dark:border-primary-900">
                      {ex.steps.map((s, j) => (
                        <li key={j} className="text-xs text-gray-500 dark:text-gray-400">
                          <span className="font-medium text-gray-700 dark:text-gray-200">Step {j + 1}:</span> {s}
                        </li>
                      ))}
                    </ol>
                    <p className="mt-3 rounded-xl bg-success-50 px-3 py-2 text-sm font-medium text-success-700 dark:bg-success-900/20 dark:text-success-400">
                      Answer: {ex.answer}
                    </p>
                  </div>
                ))}
              </TabsContent>

              <TabsContent value="applications" className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {content.applications.map((a, i) => (
                  <div key={i} className="rounded-2xl bg-gray-50 p-4 dark:bg-gray-800/50">
                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-50">{a.title}</p>
                    <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">{a.description}</p>
                  </div>
                ))}
              </TabsContent>

              <TabsContent value="formulae" className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {content.formulae.map((f, i) => (
                  <FormulaCard key={i} formula={f} />
                ))}
              </TabsContent>

              <TabsContent value="summary">
                <ul className="space-y-2">
                  {content.summary.map((s, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300">
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-success-400" />
                      {s}
                    </li>
                  ))}
                </ul>
              </TabsContent>

              <TabsContent value="flashcards">
                <FlashcardDeck cards={content.flashcards} />
              </TabsContent>

              <TabsContent value="revision">
                <ul className="space-y-2">
                  {content.revisionNotes.map((s, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300">
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-warning-400" />
                      {s}
                    </li>
                  ))}
                </ul>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </main>
    </>
  );
}
