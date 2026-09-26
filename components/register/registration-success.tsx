import Link from "next/link";
import { CheckCircle2, Clock } from "lucide-react";

// Same NODE_ENV detection as registerAdminRequest's AUTO_APPROVE_ADMIN_IN_DEV
// (lib/actions/registration.ts) - copy only, the actual account status is
// always decided server-side.
const IS_DEV = process.env.NODE_ENV !== "production";

// Stage F: shown after any registration submits successfully. Student/
// teacher/production-admin requests deliberately do NOT auto-sign-in the
// new account - status is PENDING until an admin (or, for an admin
// request, the super admin) approves it, so there is nothing to sign in to
// yet. A development-mode admin request is the one exception: the account
// really is already ACTIVE by the time this screen renders (see
// registerAdminRequest), so saying "pending approval" here would be wrong,
// not just old copy.
export function RegistrationSuccess({ kind, joinPending = false }: { kind: "student" | "teacher" | "admin"; joinPending?: boolean }) {
  // Asking to join a school that already exists is never auto-activated, even
  // in development - the account stays pending until the super administrator
  // approves the join (registerAdminRequest).
  const isDevAdmin = kind === "admin" && IS_DEV && !joinPending;

  const copy = joinPending
    ? {
        title: "Request to join sent",
        body:
          "That school already exists, so you have not been made an administrator of it. Your request to join has been sent to the super administrator, and you can sign in once it is approved.",
      }
    : isDevAdmin
    ? {
        title: "Admin account created successfully",
        body: "You can now sign in to your Admin Dashboard.",
      }
    : kind === "admin"
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
        {!isDevAdmin && (
          <div className="mb-6 flex items-center justify-center gap-1.5 rounded-xl bg-warning-50 px-3 py-2 text-xs font-medium text-warning-700 dark:bg-warning-900/20 dark:text-warning-400">
            <Clock className="h-3.5 w-3.5" /> Status: Pending approval
          </div>
        )}
        <Link href="/login" className="text-sm font-medium text-primary-600 hover:underline dark:text-primary-400">
          Back to sign in
        </Link>
      </div>
    </div>
  );
}
