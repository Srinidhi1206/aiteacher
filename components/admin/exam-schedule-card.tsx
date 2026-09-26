"use client";
// Real exam schedule (lib/actions/exam-schedule.ts). A schedule belongs to the
// school of the admin who creates it; students of that school and class see
// the published ones on their Calendar. Board, classes and subjects come from
// the real curriculum tables for the admin's own school board - nothing here
// is stored client-side, and the server re-checks ownership on every call.
import * as React from "react";
import { CalendarClock, Plus, Trash2 } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/toast";
import { DatabaseUnavailable } from "@/components/database-unavailable";
import { formatDate } from "@/lib/utils";
import { getMyAdminStatus } from "@/lib/actions/user-management";
import { listSchoolClasses, listSubjectsForClass } from "@/lib/actions/curriculum";
import { createExamSchedule, setExamSchedulePublished, deleteExamSchedule, listExamSchedulesForAdmin } from "@/lib/actions/exam-schedule";

type Schedule = Awaited<ReturnType<typeof listExamSchedulesForAdmin>>[number];

const inputClasses =
  "w-full rounded-xl border border-gray-200 bg-transparent px-3 py-2 text-sm text-gray-800 outline-none focus:border-primary-400 dark:border-gray-700 dark:text-gray-100";

export function ExamScheduleCard() {
  const { showToast } = useToast();
  const [me, setMe] = React.useState<Awaited<ReturnType<typeof getMyAdminStatus>>>(null);
  const [schedules, setSchedules] = React.useState<Schedule[] | null>(null);
  const [classes, setClasses] = React.useState<Awaited<ReturnType<typeof listSchoolClasses>>>([]);
  const [subjects, setSubjects] = React.useState<Awaited<ReturnType<typeof listSubjectsForClass>>>([]);
  const [unavailable, setUnavailable] = React.useState(false);
  const [showForm, setShowForm] = React.useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const [name, setName] = React.useState("");
  const [classId, setClassId] = React.useState("");
  const [subjectName, setSubjectName] = React.useState("");
  const [chapterScope, setChapterScope] = React.useState("");
  const [date, setDate] = React.useState("");
  const [duration, setDuration] = React.useState(60);
  const [maxMarks, setMaxMarks] = React.useState(50);

  const boardId = me?.schoolBoardId ?? null;

  const refresh = React.useCallback(async () => {
    try {
      setSchedules(await listExamSchedulesForAdmin());
    } catch {
      setUnavailable(true);
    }
  }, []);

  React.useEffect(() => {
    getMyAdminStatus().then(setMe).catch(() => setMe(null));
    refresh();
  }, [refresh]);

  React.useEffect(() => {
    if (!boardId) return;
    listSchoolClasses(boardId).then(setClasses).catch(() => setUnavailable(true));
  }, [boardId]);

  React.useEffect(() => {
    setSubjectName("");
    if (!classId) {
      setSubjects([]);
      return;
    }
    listSubjectsForClass(classId).then(setSubjects).catch(() => setUnavailable(true));
  }, [classId]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!boardId) return;
    setSaving(true);
    setError(null);
    const res = await createExamSchedule({
      name,
      boardId,
      schoolClassId: classId,
      subjectName,
      chapterScope,
      examDate: new Date(`${date}T09:00:00`).toISOString(),
      durationMinutes: duration,
      maxMarks,
    });
    setSaving(false);
    if (!res.ok) {
      setError(res.error ?? "Could not schedule the exam.");
      return;
    }
    showToast("Exam scheduled", "Publish it when you want students to see it on their calendar.");
    setName("");
    setChapterScope("");
    setDate("");
    setShowForm(false);
    refresh();
  }

  async function handleTogglePublish(s: Schedule) {
    const res = await setExamSchedulePublished(s.id, !s.isPublished);
    if (!res.ok) {
      showToast("Could not update", res.error ?? "");
      return;
    }
    refresh();
  }

  async function handleDelete(s: Schedule) {
    const res = await deleteExamSchedule(s.id);
    setConfirmDeleteId(null);
    if (!res.ok) {
      showToast("Could not delete", res.error ?? "");
      return;
    }
    showToast("Schedule deleted", s.name);
    refresh();
  }

  if (unavailable) return <DatabaseUnavailable what="Exam schedule" />;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarClock className="h-4 w-4 text-primary-500" /> Exam Schedule
        </CardTitle>
        <CardDescription className="hidden sm:block">Published exams appear on your students&apos; calendars.</CardDescription>
        {boardId && (
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setShowForm((s) => !s)}>
            <Plus className="h-3.5 w-3.5" /> Schedule Exam
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {me && !boardId && (
          <p className="mb-3 text-sm text-gray-500 dark:text-gray-400">
            Exams are scheduled by a school administrator. Your account is not attached to a school with a board, so there is nothing to schedule here.
          </p>
        )}

        {showForm && boardId && (
          <form onSubmit={handleCreate} className="mb-4 grid grid-cols-1 gap-3 rounded-xl border border-gray-100 p-4 dark:border-gray-800 sm:grid-cols-3">
            {error && <p className="text-sm text-red-600 dark:text-red-400 sm:col-span-3">{error}</p>}
            <input placeholder="Exam name (e.g. Unit Test 1)" value={name} onChange={(e) => setName(e.target.value)} required className={`${inputClasses} sm:col-span-3`} />
            <select value={classId} onChange={(e) => setClassId(e.target.value)} required className={inputClasses} aria-label="Class">
              <option value="">Class</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
            <select value={subjectName} onChange={(e) => setSubjectName(e.target.value)} required disabled={!classId} className={inputClasses} aria-label="Subject">
              <option value="">Subject</option>
              {subjects.map((s) => (
                <option key={s.id} value={s.name}>
                  {s.name}
                </option>
              ))}
            </select>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required className={inputClasses} aria-label="Exam date" />
            <input
              placeholder="Chapter / scope (e.g. Chapters 1-4)"
              value={chapterScope}
              onChange={(e) => setChapterScope(e.target.value)}
              required
              className={`${inputClasses} sm:col-span-3`}
            />
            <label className="text-xs text-gray-500">
              Duration (minutes)
              <input type="number" min={1} max={600} value={duration} onChange={(e) => setDuration(Number(e.target.value))} className={inputClasses} />
            </label>
            <label className="text-xs text-gray-500">
              Max marks
              <input type="number" min={1} value={maxMarks} onChange={(e) => setMaxMarks(Number(e.target.value))} className={inputClasses} />
            </label>
            <Button type="submit" size="sm" className="self-end" disabled={saving}>
              {saving ? "Scheduling..." : "Schedule"}
            </Button>
          </form>
        )}

        {schedules === null ? (
          <p className="py-6 text-center text-sm text-gray-400">Loading...</p>
        ) : schedules.length === 0 ? (
          <p className="py-6 text-center text-sm text-gray-400">No exams scheduled yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-xs uppercase tracking-wide text-gray-400 dark:border-gray-800">
                  <th className="py-2 pr-3 font-medium">Exam</th>
                  <th className="py-2 pr-3 font-medium">Class</th>
                  <th className="py-2 pr-3 font-medium">Scope</th>
                  <th className="py-2 pr-3 font-medium">Date</th>
                  <th className="py-2 pr-3 font-medium">Marks</th>
                  <th className="py-2 pr-3 font-medium">Status</th>
                  <th className="py-2 pr-3 font-medium" />
                </tr>
              </thead>
              <tbody>
                {schedules.map((s) => (
                  <tr key={s.id} className="border-b border-gray-50 last:border-0 dark:border-gray-800/60">
                    <td className="py-2.5 pr-3 font-medium text-gray-800 dark:text-gray-100">
                      {s.name}
                      <span className="block text-xs font-normal text-gray-400">{s.subjectName}</span>
                    </td>
                    <td className="py-2.5 pr-3 text-gray-500 dark:text-gray-400">{s.schoolClass.label}</td>
                    <td className="py-2.5 pr-3 text-gray-500 dark:text-gray-400">{s.chapterScope}</td>
                    <td className="py-2.5 pr-3 text-gray-500 dark:text-gray-400">{formatDate(s.examDate.toString())}</td>
                    <td className="py-2.5 pr-3 text-gray-500 dark:text-gray-400">{s.maxMarks}</td>
                    <td className="py-2.5 pr-3">
                      <div className="flex items-center gap-2">
                        <Badge variant={s.isPublished ? "success" : "outline"}>{s.isPublished ? "Published" : "Draft"}</Badge>
                        <Switch checked={s.isPublished} onCheckedChange={() => handleTogglePublish(s)} aria-label={`Publish "${s.name}"`} />
                      </div>
                    </td>
                    <td className="py-2.5 pr-3">
                      {confirmDeleteId === s.id ? (
                        <div className="flex items-center gap-1">
                          <button onClick={() => handleDelete(s)} className="rounded-lg px-1.5 py-1 text-[11px] font-semibold text-red-600 hover:bg-red-50 dark:hover:bg-red-950">
                            Confirm
                          </button>
                          <button onClick={() => setConfirmDeleteId(null)} className="rounded-lg px-1.5 py-1 text-[11px] text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800">
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setConfirmDeleteId(s.id)}
                          aria-label={`Delete "${s.name}"`}
                          className="rounded-lg p-1.5 text-gray-300 hover:bg-gray-100 hover:text-red-500 dark:hover:bg-gray-800"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
