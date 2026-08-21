import Link from "next/link";
import { CheckCircle2, Clock } from "lucide-react";

// Stage F: shown after any registration submits successfully. Deliberately
// does NOT auto-sign-in the new account - status is PENDING until an admin
// (or, for an admin request, the super admin) approves it, so there is
// nothing to sign in to yet.
export function RegistrationSuccess({ kind }: { kind: "student" | "teacher" | "admin" }) {
  const copy =
    kind === "admin"
      ? {
          title: "Admin access requested",
          body:
            "Your request has been submitted for review by the super administrator. You'll be notified once a decision is made - this is not an automatic approval, and most requests are reviewed within a few business days.",
        }
      : {
          title: "Registration submitted",
          body: `Your ${kind} account has been created and is pending review by a school administrator. You'll be able to sign in as soon as it's approved.`,
        };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 dark:bg-gray-950">
      <div className="w-full max-w-md rounded-2xl border border-gray-100 bg-white p-8 text-center shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-success-100 text-success-600 dark:bg-success-900/40 dark:text-success-400">
          <CheckCircle2 className="h-7 w-7" />
        </div>
        <h1 className="mb-2 text-xl font-semibold text-gray-900 dark:text-gray-50">{copy.title}</h1>
        <p className="mb-6 text-sm text-gray-500 dark:text-gray-400">{copy.body}</p>
        <div className="mb-6 flex items-center justify-center gap-1.5 rounded-xl bg-warning-50 px-3 py-2 text-xs font-medium text-warning-700 dark:bg-warning-900/20 dark:text-warning-400">
          <Clock className="h-3.5 w-3.5" /> Status: Pending approval
        </div>
        <Link href="/login" className="text-sm font-medium text-primary-600 hover:underline dark:text-primary-400">
          Back to sign in
        </Link>
      </div>
    </div>
  );
}
