// The dashboard's "Next exam" card: the nearest published exam for this student, however far away - the "Coming up" list below only looks 30 days
// ahead, so a distant exam would otherwise not appear at all. Same visibility rules as the student Calendar (published, own school + board + class).
// Fails soft: if the lookup is unavailable the card says so quietly and the rest of the dashboard is unaffected.
import { getCurrentSession } from "@/lib/auth/current-session";
import { getMyNextExam } from "@/lib/actions/student-calendar";
import { NextExamView } from "@/components/dashboard/next-exam-view";

export async function NextExamCard() {
  const session = await getCurrentSession();
  if (!session || session.role !== "student") return null;
  return getMyNextExam().then(
    (exam) => <NextExamView exam={exam} />,
    () => <NextExamView exam={null} failed />
  );
}
