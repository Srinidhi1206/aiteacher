"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { GraduationCap, ShieldCheck, User, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Role = "admin" | "teacher" | "student";

const ROLE_OPTIONS: { role: Role; label: string; icon: typeof User; hint: string }[] = [
  { role: "student", label: "I'm a Student", icon: GraduationCap, hint: "Lessons, practice papers, AI tutor" },
  { role: "teacher", label: "I'm a Teacher", icon: User, hint: "Classes, worksheets, grading" },
  { role: "admin", label: "I'm an Admin", icon: ShieldCheck, hint: "Boards, classes, subject material" },
];

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next");

  const [role, setRole] = useState<Role | null>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role, username, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Login failed.");
        return;
      }
      router.push(next || data.redirectTo);
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 dark:bg-gray-950">
      <div className="w-full max-w-md rounded-2xl border border-gray-100 bg-white p-8 shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <div className="mb-6 flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary-600 text-white">
            <GraduationCap className="h-5 w-5" />
          </div>
          <span className="text-lg font-bold tracking-tight text-gray-900 dark:text-gray-50">mAITeacher</span>
        </div>

        {!role && (
          <>
            <h1 className="mb-1 text-xl font-semibold text-gray-900 dark:text-gray-50">Welcome back</h1>
            <p className="mb-6 text-sm text-gray-500 dark:text-gray-400">First, tell us who you are.</p>
            <div className="space-y-3">
              {ROLE_OPTIONS.map((opt) => (
                <button
                  key={opt.role}
                  onClick={() => setRole(opt.role)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-xl border border-gray-200 p-4 text-left transition-colors",
                    "hover:border-primary-300 hover:bg-primary-50 dark:border-gray-700 dark:hover:border-primary-700 dark:hover:bg-primary-950"
                  )}
                >
                  <opt.icon className="h-5 w-5 shrink-0 text-primary-600" />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-50">{opt.label}</p>
                    <p className="truncate text-xs text-gray-500 dark:text-gray-400">{opt.hint}</p>
                  </div>
                </button>
              ))}
            </div>
          </>
        )}

        {role && (
          <>
            <button
              onClick={() => {
                setRole(null);
                setError(null);
              }}
              className="mb-4 flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Change role
            </button>
            <h1 className="mb-1 text-xl font-semibold capitalize text-gray-900 dark:text-gray-50">
              {role} sign in
            </h1>
            <p className="mb-6 text-sm text-gray-500 dark:text-gray-400">Enter your username and password.</p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-gray-700 dark:text-gray-300">Username</label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  autoFocus
                  className="w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm text-gray-900 outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-50 dark:focus:ring-primary-950"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-gray-700 dark:text-gray-300">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm text-gray-900 outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-50 dark:focus:ring-primary-950"
                />
              </div>

              {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Signing in..." : "Sign in"}
              </Button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
