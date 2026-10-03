"use client";
// Academic calendar management. The super administrator can publish events for any audience - every school on a
// board + class (common), one school's class, a whole school, or everyone. A school administrator manages only their
// own school's events (and can see, read-only, the common ones that reach their students). Backed by
// lib/actions/academic-calendar.ts; the rules are enforced there, this screen only reflects them.
import * as React from "react";
import { CalendarDays, Plus, Pencil, Trash2, Loader2, Eye, EyeOff } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { inputClass, labelClass } from "@/components/register/field-styles";
import { formatDate } from "@/lib/utils";
import { listStates, listBoards, listSchoolClasses, listSchools } from "@/lib/actions/curriculum";
import { getMyAdminStatus } from "@/lib/actions/user-management";
import { listAcademicEventsForAdmin, createAcademicEvent, updateAcademicEvent, setAcademicEventPublished, deleteAcademicEvent } from "@/lib/actions/academic-calendar";

type EventRow = Awaited<ReturnType<typeof listAcademicEventsForAdmin>>[number];
type State = Awaited<ReturnType<typeof listStates>>[number];
type Board = Awaited<ReturnType<typeof listBoards>>[number];
type SchoolClass = Awaited<ReturnType<typeof listSchoolClasses>>[number];
type School = Awaited<ReturnType<typeof listSchools>>[number];

const TYPES = [
  ["EXAM", "Exam"],
  ["HOLIDAY", "Holiday"],
  ["RESULT", "Results"],
  ["MEETING", "Meeting (e.g. parent-teacher)"],
  ["EVENT", "School event"],
  ["DEADLINE", "Deadline"],
  ["TERM", "Term / academic year dates"],
  ["OTHER", "Other"],
] as const;
const TYPE_LABEL: Record<string, string> = Object.fromEntries(TYPES.map(([v, l]) => [v, l.split(" (")[0]]));

interface FormState {
  id: string | null;
  title: string;
  type: (typeof TYPES)[number][0];
  startDate: string;
  endDate: string;
  academicYear: string;
  description: string;
  schoolId: string;
  stateId: string;
  boardId: string;
  schoolClassId: string;
}
const EMPTY: FormState = { id: null, title: "", type: "EVENT", startDate: "", endDate: "", academicYear: "", description: "", schoolId: "", stateId: "", boardId: "", schoolClassId: "" };

export function AcademicCalendarPanel() {
  const { showToast } = useToast();
  const [me, setMe] = React.useState<Awaited<ReturnType<typeof getMyAdminStatus>>>(null);
  const [events, setEvents] = React.useState<EventRow[] | null>(null);
  const [unavailable, setUnavailable] = React.useState(false);
  const [states, setStates] = React.useState<State[]>([]);
  const [schools, setSchools] = React.useState<School[]>([]);
  const [boards, setBoards] = React.useState<Board[]>([]);
  const [classes, setClasses] = React.useState<SchoolClass[]>([]);
  const [form, setForm] = React.useState<FormState | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);
  const [busyId, setBusyId] = React.useState<string | null>(null);

  const isSuperAdmin = me?.isSuperAdmin === true;
  const schoolBoardId = me?.schoolBoardId ?? null;

  const refresh = React.useCallback(() => {
    listAcademicEventsForAdmin()
      .then((rows) => {
        setEvents(rows);
        setUnavailable(false);
      })
      .catch(() => setUnavailable(true));
  }, []);

  React.useEffect(() => {
    refresh();
    getMyAdminStatus().then(setMe).catch(() => setMe(null));
  }, [refresh]);

  React.useEffect(() => {
    if (!isSuperAdmin) return;
    listStates().then(setStates).catch(() => {});
    listSchools().then(setSchools).catch(() => {});
  }, [isSuperAdmin]);

  // Boards of the chosen state (super administrator); classes of the chosen board - or of the school's own board.
  const formStateId = form?.stateId ?? "";
  React.useEffect(() => {
    setBoards([]);
    if (!isSuperAdmin || !formStateId) return;
    listBoards(formStateId).then(setBoards).catch(() => setBoards([]));
  }, [formStateId, isSuperAdmin]);

  const classBoardId = isSuperAdmin ? form?.boardId ?? "" : schoolBoardId ?? "";
  React.useEffect(() => {
    setClasses([]);
    if (!form || form.id || !classBoardId) return;
    listSchoolClasses(classBoardId).then(setClasses).catch(() => setClasses([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classBoardId, form?.id]);

  async function save() {
    if (!form) return;
    setSaving(true);
    setFormError(null);
    const fields = { title: form.title, type: form.type, startDate: form.startDate, endDate: form.endDate, academicYear: form.academicYear, description: form.description };
    const res = form.id
      ? await updateAcademicEvent(form.id, fields)
      : await createAcademicEvent({ ...fields, schoolId: isSuperAdmin ? form.schoolId : "", boardId: isSuperAdmin ? form.boardId : "", schoolClassId: form.schoolClassId });
    setSaving(false);
    if (!res.ok) {
      setFormError(res.error ?? "Could not save the event.");
      return;
    }
    showToast(form.id ? "Event updated" : "Event created as a draft", form.id ? form.title : "Publish it to make it visible to students.");
    setForm(null);
    refresh();
  }

  async function togglePublished(ev: EventRow) {
    setBusyId(ev.id);
    const res = await setAcademicEventPublished(ev.id, !ev.isPublished);
    setBusyId(null);
    if (!res.ok) return showToast("Could not update", res.error ?? "");
    showToast(ev.isPublished ? "Event unpublished" : "Event published", ev.title);
    refresh();
  }

  async function remove(ev: EventRow) {
    setBusyId(ev.id);
    const res = await deleteAcademicEvent(ev.id);
    setBusyId(null);
    if (!res.ok) return showToast("Could not delete", res.error ?? "");
    showToast("Event deleted", ev.title);
    refresh();
  }

  const range = (ev: EventRow) =>
    ev.endDate && ev.endDate.getTime() !== ev.startDate.getTime() ? `${formatDate(ev.startDate.toISOString())} - ${formatDate(ev.endDate.toISOString())}` : formatDate(ev.startDate.toISOString());

  const audiencePreview = form && !form.id
    ? isSuperAdmin
      ? [
          form.schoolId ? schools.find((s) => s.id === form.schoolId)?.name ?? "One school" : "All schools",
          form.boardId ? boards.find((b) => b.id === form.boardId)?.shortName ?? "one board" : "all boards",
          form.schoolClassId ? classes.find((c) => c.id === form.schoolClassId)?.label ?? "one class" : "all classes",
        ].join(" · ")
      : [me?.schoolName ?? "Your school", form.schoolClassId ? classes.find((c) => c.id === form.schoolClassId)?.label ?? "one class" : "all classes"].join(" · ")
    : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-primary-500" /> Academic Calendar
        </CardTitle>
        <CardDescription className="hidden sm:block">
          Holidays, exam dates, terms and school events. New events start as drafts; once published they appear on the calendar of exactly the students in the
          audience you choose.
        </CardDescription>
        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setForm({ ...EMPTY })} disabled={!me || (!isSuperAdmin && !me.schoolId)}>
          <Plus className="h-3.5 w-3.5" /> Add event
        </Button>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        {me && !isSuperAdmin && !me.schoolId && <p className="py-2 text-sm text-gray-500 dark:text-gray-400">Your account is not attached to a school, so there is no school calendar to manage.</p>}
        {unavailable ? (
          <p className="py-8 text-center text-sm text-gray-400">The calendar could not be loaded right now.</p>
        ) : events === null ? (
          <p className="py-8 text-center text-sm text-gray-400">Loading...</p>
        ) : events.length === 0 ? (
          <p className="py-8 text-center text-sm text-gray-400">No calendar events yet.</p>
        ) : (
          <table className="w-full min-w-[820px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-xs uppercase tracking-wide text-gray-400 dark:border-gray-800">
                <th className="py-2 pr-3 font-medium">Dates</th>
                <th className="py-2 pr-3 font-medium">Event</th>
                <th className="py-2 pr-3 font-medium">Type</th>
                <th className="py-2 pr-3 font-medium">Who sees it</th>
                <th className="py-2 pr-3 font-medium">Status</th>
                <th className="py-2 pr-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {events.map((ev) => (
                <tr key={ev.id} className="border-b border-gray-50 last:border-0 dark:border-gray-800/60">
                  <td className="whitespace-nowrap py-2.5 pr-3 text-gray-600 dark:text-gray-300">{range(ev)}</td>
                  <td className="py-2.5 pr-3 font-medium text-gray-800 dark:text-gray-100">
                    {ev.title}
                    {ev.academicYear && <span className="ml-1.5 text-xs font-normal text-gray-400">{ev.academicYear}</span>}
                  </td>
                  <td className="py-2.5 pr-3">
                    <Badge variant="outline">{TYPE_LABEL[ev.type] ?? ev.type}</Badge>
                  </td>
                  <td className="py-2.5 pr-3 text-gray-500 dark:text-gray-400">
                    {ev.audience}
                    {!ev.editable && <span className="ml-1.5 text-xs text-gray-400">(common - read-only)</span>}
                  </td>
                  <td className="py-2.5 pr-3">
                    <Badge variant={ev.isPublished ? "success" : "warning"}>{ev.isPublished ? "Published" : "Draft"}</Badge>
                  </td>
                  <td className="py-2.5 pr-3">
                    {ev.editable && (
                      <div className="flex flex-wrap gap-1.5">
                        <Button size="sm" variant="outline" disabled={busyId === ev.id} onClick={() => togglePublished(ev)}>
                          {busyId === ev.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : ev.isPublished ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}{" "}
                          {ev.isPublished ? "Unpublish" : "Publish"}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busyId === ev.id}
                          onClick={() =>
                            setForm({
                              ...EMPTY,
                              id: ev.id,
                              title: ev.title,
                              type: ev.type,
                              startDate: ev.startDate.toISOString().slice(0, 10),
                              endDate: ev.endDate ? ev.endDate.toISOString().slice(0, 10) : "",
                              academicYear: ev.academicYear ?? "",
                              description: ev.description ?? "",
                            })
                          }
                        >
                          <Pencil className="h-3.5 w-3.5" /> Edit
                        </Button>
                        <Button size="sm" variant="danger" disabled={busyId === ev.id} onClick={() => remove(ev)}>
                          <Trash2 className="h-3.5 w-3.5" /> Delete
                        </Button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>

      <Modal
        open={!!form}
        onClose={() => (saving ? undefined : setForm(null))}
        title={form?.id ? "Edit event" : "Add calendar event"}
        description={form?.id ? "The audience of an event cannot be changed. To change it, delete the event and create a new one." : "The event is saved as a draft until you publish it."}
      >
        {form && (
          <div className="space-y-3">
            <div>
              <label className={labelClass}>Title</label>
              <input className={inputClass} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} disabled={saving} />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className={labelClass}>Type</label>
                <select className={inputClass} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as FormState["type"] })} disabled={saving}>
                  {TYPES.map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelClass}>Academic year (optional)</label>
                <input className={inputClass} placeholder="2026-27" value={form.academicYear} onChange={(e) => setForm({ ...form, academicYear: e.target.value })} disabled={saving} />
              </div>
              <div>
                <label className={labelClass}>Start date</label>
                <input type="date" className={inputClass} value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} disabled={saving} />
              </div>
              <div>
                <label className={labelClass}>End date (optional)</label>
                <input type="date" className={inputClass} value={form.endDate} min={form.startDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} disabled={saving} />
              </div>
            </div>
            <div>
              <label className={labelClass}>Description (optional)</label>
              <textarea className={inputClass} rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} disabled={saving} />
            </div>

            {!form.id && (
              <div className="space-y-3 rounded-xl border border-gray-100 p-3 dark:border-gray-800">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Who sees it</p>
                {isSuperAdmin ? (
                  <>
                    <div>
                      <label className={labelClass}>School</label>
                      <select className={inputClass} value={form.schoolId} onChange={(e) => setForm({ ...form, schoolId: e.target.value })} disabled={saving}>
                        <option value="">All schools (common event)</option>
                        {schools.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <label className={labelClass}>State</label>
                        <select className={inputClass} value={form.stateId} onChange={(e) => setForm({ ...form, stateId: e.target.value, boardId: "", schoolClassId: "" })} disabled={saving}>
                          <option value="">Any state</option>
                          {states.map((st) => (
                            <option key={st.id} value={st.id}>
                              {st.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className={labelClass}>Board</label>
                        <select className={inputClass} value={form.boardId} onChange={(e) => setForm({ ...form, boardId: e.target.value, schoolClassId: "" })} disabled={saving || !form.stateId}>
                          <option value="">{form.stateId ? "All boards" : "Choose a state to pick a board"}</option>
                          {boards.map((b) => (
                            <option key={b.id} value={b.id}>
                              {b.shortName}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-gray-600 dark:text-gray-300">Your school: {me?.schoolName ?? "-"}</p>
                )}
                <div>
                  <label className={labelClass}>Class</label>
                  <select className={inputClass} value={form.schoolClassId} onChange={(e) => setForm({ ...form, schoolClassId: e.target.value })} disabled={saving || !classBoardId}>
                    <option value="">{classBoardId ? "All classes" : isSuperAdmin ? "Choose a board to pick a class" : "All classes"}</option>
                    {classes.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>
                {audiencePreview && (
                  <p className="text-sm text-gray-700 dark:text-gray-200">
                    <span className="text-gray-400">Visible to: </span>
                    {audiencePreview}
                  </p>
                )}
                {isSuperAdmin && !form.schoolId && !form.boardId && !form.schoolClassId && (
                  <p className="text-xs text-warning-700 dark:text-warning-400">With no school, board or class chosen, this event will reach every student on the platform.</p>
                )}
              </div>
            )}

            {formError && <p className="text-sm text-red-600 dark:text-red-400">{formError}</p>}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setForm(null)} disabled={saving}>
                Cancel
              </Button>
              <Button onClick={save} disabled={saving || !form.title.trim() || !form.startDate}>
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} {form.id ? "Save changes" : "Create event"}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </Card>
  );
}
