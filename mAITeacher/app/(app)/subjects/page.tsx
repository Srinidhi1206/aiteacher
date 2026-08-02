import { Topbar } from "@/components/layout/topbar";
import { SubjectCard } from "@/components/subjects/subject-card";
import { subjects } from "@/lib/mock-data/subjects";

export default function Page() {
  return (
    <>
      <Topbar title="Subjects" />
      <main className="flex-1 space-y-4 p-4 sm:p-6">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Pick a subject to explore its chapters and topics, or jump straight back into where you left off.
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {subjects.map((subject) => (
            <SubjectCard key={subject.id} subject={subject} />
          ))}
        </div>
      </main>
    </>
  );
}
