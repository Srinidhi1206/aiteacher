"use client";
import * as React from "react";
import Link from "next/link";
import { ShieldCheck, ArrowLeft, DatabaseZap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { inputClass, labelClass } from "@/components/register/field-styles";
import { RegistrationSuccess } from "@/components/register/registration-success";
import { registerAdminRequest } from "@/lib/actions/registration";
import { useCurriculumSelect } from "@/lib/hooks/use-curriculum-select";

const PASSWORD_REGEX = /^(?=.*[A-Za-z])(?=.*\d).{8,}$/;

// Same NODE_ENV detection as registerAdminRequest's AUTO_APPROVE_ADMIN_IN_DEV
// (lib/actions/registration.ts) - this only changes copy, never behavior;
// the actual account-creation/approval logic lives entirely server-side.
const IS_DEV = process.env.NODE_ENV !== "production";

export default function RegisterAdminPage() {
  const curriculum = useCurriculumSelect();
  const [schoolName, setSchoolName] = React.useState("");
  const [name, setName] = React.useState("");
  const [username, setUsername] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [submitted, setSubmitted] = React.useState(false);
  const [joinPending, setJoinPending] = React.useState(false);

  function clientValidate(): string | null {
    if (!name.trim()) return "Full name is required.";
    if (username.trim().length < 3) return "Username must be at least 3 characters.";
    if (!email.trim().includes("@")) return "Enter a valid email address.";
    if (!PASSWORD_REGEX.test(password)) return "Password must be at least 8 characters and include a letter and a number.";
    if (password !== confirmPassword) return "Passwords do not match.";
    if (reason.trim().length < 20) return "Please explain why you need administrator access (at least 20 characters).";
    if (!schoolName.trim()) return "School name is required.";
    if (!curriculum.stateId) return "Select your state.";
    if (!curriculum.boardId) return "Select your board.";
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const clientError = clientValidate();
    if (clientError) {
      setError(clientError);
      return;
    }
    setLoading(true);
    try {
      const result = await registerAdminRequest({
        name,
        username,
        email,
        password,
        confirmPassword,
        phone: phone || undefined,
        reason,
        schoolName,
        stateId: curriculum.stateId,
        boardId: curriculum.boardId,
      });
      if (!result.ok) {
        setError(result.error || "Request failed.");
        return;
      }
      setJoinPending(result.data?.joinPending === true);
      setSubmitted(true);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (submitted) return <RegistrationSuccess kind="admin" joinPending={joinPending} />;

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-10 dark:bg-gray-950">
      <div className="w-full max-w-md rounded-2xl border border-gray-100 bg-white p-8 shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <div className="mb-6 flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary-600 text-white">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <span className="text-lg font-bold tracking-tight text-gray-900 dark:text-gray-50">mAITeacher</span>
        </div>
        <Link href="/register" className="mb-4 flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
          <ArrowLeft className="h-3.5 w-3.5" /> Change role
        </Link>
        <h1 className="mb-1 text-xl font-semibold text-gray-900 dark:text-gray-50">
          {IS_DEV ? "Create Admin Account" : "Request admin access"}
        </h1>
        <p className="mb-6 text-sm text-gray-500 dark:text-gray-400">
          {IS_DEV
            ? "Create your school administrator account to manage curriculum, students, study materials, tests, assignments, and student progress."
            : "This does not create an admin account. Your request is reviewed by the super administrator, who may approve or reject it."}
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className={labelClass}>Full name</label>
            <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} required disabled={loading} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Username</label>
              <input className={inputClass} value={username} onChange={(e) => setUsername(e.target.value)} required disabled={loading} />
            </div>
            <div>
              <label className={labelClass}>Phone (optional)</label>
              <input className={inputClass} value={phone} onChange={(e) => setPhone(e.target.value)} disabled={loading} />
            </div>
          </div>
          <div>
            <label className={labelClass}>Email</label>
            <input type="email" className={inputClass} value={email} onChange={(e) => setEmail(e.target.value)} required disabled={loading} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Password</label>
              <input type="password" className={inputClass} value={password} onChange={(e) => setPassword(e.target.value)} required disabled={loading} />
            </div>
            <div>
              <label className={labelClass}>Confirm password</label>
              <input type="password" className={inputClass} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required disabled={loading} />
            </div>
          </div>
          <div>
            <label className={labelClass}>Why do you need administrator access?</label>
            <textarea
              className={inputClass}
              rows={4}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
              disabled={loading}
              placeholder="Minimum 20 characters"
            />
          </div>

          <div className="border-t border-gray-100 pt-4 dark:border-gray-800">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">School</p>
            {curriculum.unavailable && (
              <div className="mb-3 flex items-start gap-2 rounded-xl bg-gray-100 p-3 text-xs text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                <DatabaseZap className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                State and board options need a connected database and can&apos;t be loaded right now.
              </div>
            )}
            <div>
              <label className={labelClass}>School name</label>
              <input
                className={inputClass}
                value={schoolName}
                onChange={(e) => setSchoolName(e.target.value)}
                required
                disabled={loading}
                placeholder="e.g. Sunrise Public School"
              />
              <p className="mt-1 text-xs text-gray-400">
                If a school with this exact name already exists under the same state and board, you&apos;ll join it as a co-administrator instead of creating a duplicate.
              </p>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>State</label>
                <select
                  className={inputClass}
                  value={curriculum.stateId}
                  onChange={(e) => curriculum.setStateId(e.target.value)}
                  required
                  disabled={loading || curriculum.unavailable}
                >
                  <option value="">Select state</option>
                  {curriculum.states.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelClass}>Board</label>
                <select
                  className={inputClass}
                  value={curriculum.boardId}
                  onChange={(e) => curriculum.setBoardId(e.target.value)}
                  required
                  disabled={loading || !curriculum.stateId}
                >
                  <option value="">Select board</option>
                  {curriculum.boards.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.shortName}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

          <Button type="submit" className="w-full" disabled={loading || curriculum.unavailable}>
            {loading ? "Submitting..." : IS_DEV ? "Create Admin Account" : "Submit request"}
          </Button>
        </form>
      </div>
    </div>
  );
}
