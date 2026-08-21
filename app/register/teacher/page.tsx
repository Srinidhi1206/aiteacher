"use client";
import * as React from "react";
import Link from "next/link";
import { User, ArrowLeft, Plus, Trash2, DatabaseZap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { inputClass, labelClass } from "@/components/register/field-styles";
import { RegistrationSuccess } from "@/components/register/registration-success";
import { useCurriculumSelect } from "@/lib/hooks/use-curriculum-select";
import { registerTeacher } from "@/lib/actions/registration";
import { listSubjectsForClass } from "@/lib/actions/curriculum";

const PASSWORD_REGEX = /^(?=.*[A-Za-z])(?=.*\d).{8,}$/;

interface AssignmentRow {
  key: number;
  schoolClassId: string;
  subjectId: string;
  subjects: Awaited<ReturnType<typeof listSubjectsForClass>>;
}

let rowKeySeq = 0;

function AssignmentRowFields({
  row,
  schoolClasses,
  onChange,
  onRemove,
  disabled,
  removable,
}: {
  row: AssignmentRow;
  schoolClasses: { id: string; label: string }[];
  onChange: (row: AssignmentRow) => void;
  onRemove: () => void;
  disabled: boolean;
  removable: boolean;
}) {
  async function handleClassChange(schoolClassId: string) {
    onChange({ ...row, schoolClassId, subjectId: "", subjects: [] });
    if (!schoolClassId) return;
    const subjects = await listSubjectsForClass(schoolClassId).catch(() => []);
    onChange({ ...row, schoolClassId, subjectId: "", subjects });
  }

  return (
    <div className="flex items-end gap-2">
      <div className="flex-1">
        <label className={labelClass}>Class</label>
        <select className={inputClass} value={row.schoolClassId} onChange={(e) => handleClassChange(e.target.value)} disabled={disabled}>
          <option value="">Select class</option>
          {schoolClasses.map((c) => (
            <option key={c.id} value={c.id}>{c.label}</option>
          ))}
        </select>
      </div>
      <div className="flex-1">
        <label className={labelClass}>Subject</label>
        <select
          className={inputClass}
          value={row.subjectId}
          onChange={(e) => onChange({ ...row, subjectId: e.target.value })}
          disabled={disabled || !row.schoolClassId}
        >
          <option value="">Select subject</option>
          {row.subjects.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </div>
      {removable && (
        <button type="button" onClick={onRemove} disabled={disabled} className="mb-0.5 rounded-lg p-2.5 text-gray-400 hover:bg-gray-100 hover:text-red-500 dark:hover:bg-gray-800">
          <Trash2 className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

export default function RegisterTeacherPage() {
  const curriculum = useCurriculumSelect();
  const [name, setName] = React.useState("");
  const [username, setUsername] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [rows, setRows] = React.useState<AssignmentRow[]>([{ key: rowKeySeq++, schoolClassId: "", subjectId: "", subjects: [] }]);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [submitted, setSubmitted] = React.useState(false);

  function clientValidate(): string | null {
    if (!name.trim()) return "Full name is required.";
    if (username.trim().length < 3) return "Username must be at least 3 characters.";
    if (!email.trim().includes("@")) return "Enter a valid email address.";
    if (!PASSWORD_REGEX.test(password)) return "Password must be at least 8 characters and include a letter and a number.";
    if (password !== confirmPassword) return "Passwords do not match.";
    if (!curriculum.stateId) return "Select your state.";
    if (!curriculum.boardId) return "Select your board.";
    const complete = rows.filter((r) => r.schoolClassId && r.subjectId);
    if (complete.length === 0) return "Select at least one class and subject you teach.";
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
      const result = await registerTeacher({
        name,
        username,
        email,
        password,
        confirmPassword,
        phone: phone || undefined,
        stateId: curriculum.stateId,
        boardId: curriculum.boardId,
        schoolId: curriculum.schoolId || undefined,
        requestedAssignments: rows
          .filter((r) => r.schoolClassId && r.subjectId)
          .map((r) => ({ schoolClassId: r.schoolClassId, subjectId: r.subjectId })),
      });
      if (!result.ok) {
        setError(result.error || "Registration failed.");
        return;
      }
      setSubmitted(true);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (submitted) return <RegistrationSuccess kind="teacher" />;

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-10 dark:bg-gray-950">
      <div className="w-full max-w-lg rounded-2xl border border-gray-100 bg-white p-8 shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <div className="mb-6 flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary-600 text-white">
            <User className="h-5 w-5" />
          </div>
          <span className="text-lg font-bold tracking-tight text-gray-900 dark:text-gray-50">mAITeacher</span>
        </div>
        <Link href="/register" className="mb-4 flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
          <ArrowLeft className="h-3.5 w-3.5" /> Change role
        </Link>
        <h1 className="mb-1 text-xl font-semibold text-gray-900 dark:text-gray-50">Teacher registration</h1>
        <p className="mb-6 text-sm text-gray-500 dark:text-gray-400">
          The classes and subjects you request are reviewed by an administrator - your actual teaching assignments are granted after approval.
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

          <div className="border-t border-gray-100 pt-4 dark:border-gray-800">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">Curriculum</p>
            {curriculum.unavailable && (
              <div className="mb-3 flex items-start gap-2 rounded-xl bg-gray-100 p-3 text-xs text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                <DatabaseZap className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                State, board, class, and school options need a connected database and can&apos;t be loaded right now. Registration cannot be completed until this is set up - see docs/DATABASE.md.
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>State</label>
                <select className={inputClass} value={curriculum.stateId} onChange={(e) => curriculum.setStateId(e.target.value)} required disabled={loading}>
                  <option value="">Select state</option>
                  {curriculum.states.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelClass}>Board</label>
                <select className={inputClass} value={curriculum.boardId} onChange={(e) => curriculum.setBoardId(e.target.value)} required disabled={loading || !curriculum.stateId}>
                  <option value="">Select board</option>
                  {curriculum.boards.map((b) => (
                    <option key={b.id} value={b.id}>{b.shortName}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="mt-3">
              <label className={labelClass}>School (optional)</label>
              <select className={inputClass} value={curriculum.schoolId} onChange={(e) => curriculum.setSchoolId(e.target.value)} disabled={loading || !curriculum.stateId}>
                <option value="">Select school</option>
                {curriculum.schools.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="border-t border-gray-100 pt-4 dark:border-gray-800">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Classes &amp; subjects you teach</p>
              <button
                type="button"
                disabled={loading || !curriculum.boardId}
                onClick={() => setRows((prev) => [...prev, { key: rowKeySeq++, schoolClassId: "", subjectId: "", subjects: [] }])}
                className="flex items-center gap-1 text-xs font-medium text-primary-600 hover:underline disabled:opacity-50 dark:text-primary-400"
              >
                <Plus className="h-3.5 w-3.5" /> Add another
              </button>
            </div>
            {!curriculum.boardId && <p className="text-xs text-gray-400">Select a board first.</p>}
            <div className="space-y-3">
              {rows.map((row) => (
                <AssignmentRowFields
                  key={row.key}
                  row={row}
                  schoolClasses={curriculum.schoolClasses}
                  disabled={loading}
                  removable={rows.length > 1}
                  onChange={(updated) => setRows((prev) => prev.map((r) => (r.key === updated.key ? updated : r)))}
                  onRemove={() => setRows((prev) => prev.filter((r) => r.key !== row.key))}
                />
              ))}
            </div>
          </div>

          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

          <Button type="submit" className="w-full" disabled={loading || curriculum.unavailable}>
            {loading ? "Submitting..." : "Submit registration"}
          </Button>
        </form>
      </div>
    </div>
  );
}
