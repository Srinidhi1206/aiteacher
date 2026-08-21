import Link from "next/link";
import { GraduationCap, User, ShieldCheck, ArrowLeft } from "lucide-react";

const ROLE_OPTIONS = [
  { href: "/register/student", label: "I'm a Student", icon: GraduationCap, hint: "Register with your class, board, and school." },
  { href: "/register/teacher", label: "I'm a Teacher", icon: User, hint: "Register with the classes and subjects you teach." },
  { href: "/register/admin", label: "Request Admin Access", icon: ShieldCheck, hint: "Submit a request for review by the super administrator." },
];

export default function RegisterRoleSelectPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 dark:bg-gray-950">
      <div className="w-full max-w-md rounded-2xl border border-gray-100 bg-white p-8 shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <div className="mb-6 flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary-600 text-white">
            <GraduationCap className="h-5 w-5" />
          </div>
          <span className="text-lg font-bold tracking-tight text-gray-900 dark:text-gray-50">mAITeacher</span>
        </div>

        <h1 className="mb-1 text-xl font-semibold text-gray-900 dark:text-gray-50">Create an account</h1>
        <p className="mb-6 text-sm text-gray-500 dark:text-gray-400">
          New accounts are reviewed by an administrator before they can sign in.
        </p>

        <div className="space-y-3">
          {ROLE_OPTIONS.map((opt) => (
            <Link
              key={opt.href}
              href={opt.href}
              className="flex w-full items-center gap-3 rounded-xl border border-gray-200 p-4 text-left transition-colors hover:border-primary-300 hover:bg-primary-50 dark:border-gray-700 dark:hover:border-primary-700 dark:hover:bg-primary-950"
            >
              <opt.icon className="h-5 w-5 shrink-0 text-primary-600" />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-900 dark:text-gray-50">{opt.label}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">{opt.hint}</p>
              </div>
            </Link>
          ))}
        </div>

        <Link href="/login" className="mt-6 flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
          <ArrowLeft className="h-3.5 w-3.5" /> Already have an account? Sign in
        </Link>
      </div>
    </div>
  );
}
