// Real practice: topics from the student's own curriculum, sessions stored as
// Paper/Attempt/Score rows (lib/actions/practice.ts), results feeding the same
// mastery as exams. Replaces the sample practice papers.
import { Topbar } from "@/components/layout/topbar";
import { DatabaseUnavailable } from "@/components/database-unavailable";
import { PracticeLauncher } from "@/components/practice/practice-launcher";
import { getMySubjects } from "@/lib/actions/student-curriculum";
import { listMyPracticeHistory } from "@/lib/actions/practice";

export default async function PracticePage() {
  let subjects: Awaited<ReturnType<typeof getMySubjects>>["subjects"];
  let history: Awaited<ReturnType<typeof listMyPracticeHistory>>;
  try {
    [{ subjects }, history] = await Promise.all([getMySubjects(), listMyPracticeHistory()]);
  } catch {
    return (
      <>
        <Topbar title="Practice" />
        <main className="flex-1 p-4 sm:p-6">
          <DatabaseUnavailable what="Practice" />
        </main>
      </>
    );
  }

  return (
    <>
      <Topbar title="Practice" />
      <main className="flex-1 p-4 sm:p-6">
        <PracticeLauncher subjects={subjects} history={history} />
      </main>
    </>
  );
}
