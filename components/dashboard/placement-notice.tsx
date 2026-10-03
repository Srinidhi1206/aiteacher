import { UserX } from "lucide-react";
import { getMyAccount } from "@/lib/actions/account";

/**
 * Shown to a student who has been approved but not yet placed in a school. Study materials, exams, assignments and the
 * school calendar all belong to a school, so until an administrator assigns one those pages are empty by design - this
 * says so instead of leaving the student wondering. Renders nothing for everyone else, and nothing if the lookup fails.
 */
export async function PlacementNotice() {
  const account = await getMyAccount().catch(() => null);
  if (!account || account.role !== "student" || account.schoolName) return null;
  return (
    <div role="status" className="flex items-start gap-3 rounded-2xl border border-warning-200 bg-warning-50 p-4 text-sm text-warning-800 dark:border-warning-900/50 dark:bg-warning-900/20 dark:text-warning-300">
      <UserX className="mt-0.5 h-4 w-4 shrink-0" />
      <p>
        <span className="font-medium">You haven&apos;t been placed in a school yet.</span> Your school administrator will add you soon. Until then, study materials, exams and
        assignments for your school won&apos;t appear - your subjects and the AI Tutor still work.
      </p>
    </div>
  );
}
