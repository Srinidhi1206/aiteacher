import { Topbar } from "@/components/layout/topbar";
import { DetectionBanner } from "@/components/weak-areas/detection-banner";
import { WeakConceptCard } from "@/components/weak-areas/weak-concept-card";
import { weakConcepts } from "@/lib/mock-data/weak-areas";
import { subjectColorClasses } from "@/lib/subject-colors";
import { subjects } from "@/lib/mock-data/subjects";

export default function WeakAreasPage() {
  const bySubject = subjects
    .map((s) => ({ subject: s, concepts: weakConcepts.filter((wc) => wc.subject === s.name) }))
    .filter((group) => group.concepts.length > 0);

  return (
    <>
      <Topbar title="Weak Areas" />
      <main className="flex-1 space-y-6 p-4 sm:p-6">
        <DetectionBanner />

        <div className="space-y-8">
          {bySubject.map(({ subject, concepts }) => (
            <section key={subject.id}>
              <div className="mb-3 flex items-center gap-2">
                <span
                  className={`h-2.5 w-2.5 rounded-full ${subjectColorClasses[subject.color]?.bar ?? "bg-primary-500"}`}
                />
                <h2 className="text-base font-semibold text-gray-900 dark:text-gray-50">{subject.name}</h2>
                <span className="text-xs text-gray-400">
                  {concepts.length} flagged {concepts.length === 1 ? "concept" : "concepts"}
                </span>
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {concepts.map((concept) => (
                  <WeakConceptCard key={concept.id} concept={concept} />
                ))}
              </div>
            </section>
          ))}
        </div>
      </main>
    </>
  );
}
