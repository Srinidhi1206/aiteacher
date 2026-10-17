import { Topbar } from "@/components/layout/topbar";
import { StudyPlanTabs } from "@/components/study-plan/study-plan-tabs";
import { DatabaseUnavailable } from "@/components/database-unavailable";
import { getMyLearningPath, getMyPlanCoverageNotes, getMyWeakAreas } from "@/lib/actions/analytics";
import { getMySubjects } from "@/lib/actions/student-curriculum";
import { buildPlanPageNotes, subjectLinkMap } from "@/lib/study-plan/page-notes";

// "My Plan" now reads the same real, database-backed Learning Path engine
// (lib/analytics/learning-path.ts via lib/actions/analytics.ts) already
// used by the dashboard's RealDataSection - previously this page showed an
// entirely separate hand-written mock schedule (lib/mock-data/study-plan.ts)
// that had nothing to do with the student's actual weak areas/exams. The
// "Exam Planner" tab is unchanged for now (still a client-only calculator,
// not wired to the real ExamPlan model) - a separate, smaller piece of work.
export default async function StudyPlanPage() {
  let learningPath: Awaited<ReturnType<typeof getMyLearningPath>> | null = null;
  let weakAreas: Awaited<ReturnType<typeof getMyWeakAreas>> = [];
  let planNotes: string[] = [];
  let dbUnavailable = false;
  // Each task links to its subject's page (chapters, materials, practice). If the subjects cannot be read the page simply has no links.
  const subjectLinks = await getMySubjects().then((r) => subjectLinkMap(r.subjects), () => ({}));
  try {
    [learningPath, weakAreas, planNotes] = await Promise.all([getMyLearningPath(), getMyWeakAreas(), getMyPlanCoverageNotes()]);
  } catch {
    dbUnavailable = true;
  }

  return (
    <>
      <Topbar title="Study Plan" />
      <main className="flex-1 p-4 sm:p-6">
        {dbUnavailable ? <DatabaseUnavailable what="Your study plan" /> : <StudyPlanTabs
            learningPath={learningPath}
            weakAreas={weakAreas}
            planNotes={buildPlanPageNotes({ advice: planNotes, hasPlanItems: (learningPath?.items.length ?? 0) > 0, hasWeakAreas: weakAreas.length > 0 })}
            subjectLinks={subjectLinks}
          />}
      </main>
    </>
  );
}
