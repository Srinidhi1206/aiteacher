"use client";
// Import a calendar from a PDF or image: choose a file -> the document is read -> an EDITABLE preview -> the administrator reviews it and
// presses "Save ... as drafts" -> only then are calendar events created, and only as DRAFTS (publishing is a separate step on the calendar
// screen). Nothing is created before that; rows the reader was unsure of start unticked and carry a warning; rows that already exist for the
// audience are marked and cannot be saved twice. The server re-validates everything on save (lib/calendar-import/core.ts) - this screen is a
// convenience. The decisions (what can be saved, what the button says, what happens when a save fails) live in lib/calendar-import/review.ts.
//
// The main button lives in the dialog's pinned footer (Modal `footer`), outside the scrolling area, so it is always reachable. Saved events are
// real draft events and stay in the calendar; extracted rows that are NOT saved exist only on this screen, so closing it asks first.
import * as React from "react";
import { Loader2, UploadCloud, AlertTriangle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { inputClass, labelClass } from "@/components/register/field-styles";
import { CalendarReviewFooter } from "@/components/admin/calendar-review-footer";
import { listStates, listBoards, listSchoolClasses, listSchools } from "@/lib/actions/curriculum";
import { confirmCalendarImport, checkCalendarImportDuplicates } from "@/lib/actions/calendar-import";
import { summaryText } from "@/lib/calendar-import/normalize";
import { audienceNeedsAck, planSave, rowProblem, saveButtonState, saveDraftRows, tickLocked, unsavedCount, type ReviewRow } from "@/lib/calendar-import/review";
import type { PreviewEvent } from "@/lib/calendar-import/types";

type State = Awaited<ReturnType<typeof listStates>>[number];
type Board = Awaited<ReturnType<typeof listBoards>>[number];
type SchoolClass = Awaited<ReturnType<typeof listSchoolClasses>>[number];
type School = Awaited<ReturnType<typeof listSchools>>[number];

const TYPES: [PreviewEvent["type"], string][] = [
  ["EXAM", "Exam"], ["HOLIDAY", "Holiday"], ["RESULT", "Results"], ["MEETING", "Meeting"], ["EVENT", "School event"], ["DEADLINE", "Deadline"], ["TERM", "Term / year dates"], ["OTHER", "Other"],
];

type Row = ReviewRow;

interface Extracted {
  method: string;
  academicYear: string;
  notes: string[];
  sourceName: string;
  sourceUrl: string | null;
  summary: { total: number; high: number; review: number };
}

export interface ImportAdmin {
  isSuperAdmin: boolean;
  schoolId: string | null;
  schoolName: string | null;
  schoolBoardId: string | null;
}

const METHOD_LABEL: Record<string, string> = { "text-layer": "read from the PDF's text", "text-layer+ai": "read from the PDF's text, structured by the AI reader", "ai-vision": "read as an image (OCR / document vision)" };

export function CalendarImportDialog({
  open,
  onClose,
  admin,
  onImported,
  onViewDrafts,
}: {
  open: boolean;
  onClose: () => void;
  admin: ImportAdmin;
  /** Called after a save that created draft events (so the calendar behind can reload). */
  onImported: (info: { created: number }) => void;
  /** "Show me the saved drafts": the calendar behind switches to its Drafts view. */
  onViewDrafts: () => void;
}) {
  const { showToast } = useToast();
  const [file, setFile] = React.useState<File | null>(null);
  const [reading, setReading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [extracted, setExtracted] = React.useState<Extracted | null>(null);
  const [rows, setRows] = React.useState<Row[]>([]);
  const [duplicates, setDuplicates] = React.useState<Record<string, boolean>>({});
  const [saving, setSaving] = React.useState(false);
  const savingRef = React.useRef(false); // a synchronous guard: two quick clicks cannot start two saves
  const [savedTotal, setSavedTotal] = React.useState(0);
  const [lastSave, setLastSave] = React.useState<{ created: number; skipped: number; leftOut: number } | null>(null);
  const [ack, setAck] = React.useState(false);

  const [states, setStates] = React.useState<State[]>([]);
  const [schools, setSchools] = React.useState<School[]>([]);
  const [boards, setBoards] = React.useState<Board[]>([]);
  const [classes, setClasses] = React.useState<SchoolClass[]>([]);
  const [schoolId, setSchoolId] = React.useState("");
  const [stateId, setStateId] = React.useState("");
  const [boardId, setBoardId] = React.useState("");
  const [classId, setClassId] = React.useState("");

  const reset = React.useCallback(() => {
    setFile(null);
    setReading(false);
    setError(null);
    setExtracted(null);
    setRows([]);
    setDuplicates({});
    setSchoolId("");
    setStateId("");
    setBoardId("");
    setClassId("");
    setSavedTotal(0);
    setLastSave(null);
    setAck(false);
  }, []);

  React.useEffect(() => {
    if (!open) reset();
  }, [open, reset]);

  React.useEffect(() => {
    if (!open || !admin.isSuperAdmin) return;
    listStates().then(setStates).catch(() => {});
    listSchools().then(setSchools).catch(() => {});
  }, [open, admin.isSuperAdmin]);

  React.useEffect(() => {
    setBoards([]);
    if (!admin.isSuperAdmin || !stateId) return;
    listBoards(stateId).then(setBoards).catch(() => setBoards([]));
  }, [stateId, admin.isSuperAdmin]);

  const classBoardId = admin.isSuperAdmin ? boardId : admin.schoolBoardId ?? "";
  React.useEffect(() => {
    setClasses([]);
    if (!classBoardId) return;
    listSchoolClasses(classBoardId).then(setClasses).catch(() => setClasses([]));
  }, [classBoardId]);

  const scope = React.useMemo(() => ({ schoolId: admin.isSuperAdmin ? schoolId : "", boardId: admin.isSuperAdmin ? boardId : "", schoolClassId: classId }), [admin.isSuperAdmin, schoolId, boardId, classId]);

  // A wide-open audience needs an explicit "yes"; changing the audience clears it.
  const needsAck = audienceNeedsAck(admin.isSuperAdmin, scope);
  React.useEffect(() => {
    setAck(false);
  }, [schoolId, boardId, classId]);

  // Which rows already exist for the chosen audience - re-checked whenever the audience or a row's title / date / class changes.
  const dupInputKey = JSON.stringify([scope, rows.map((r) => [r.id, r.title, r.startDate, r.schoolClassId])]);
  React.useEffect(() => {
    if (!extracted || rows.length === 0) return;
    const t = setTimeout(async () => {
      try {
        const res = await checkCalendarImportDuplicates({ scope, events: rows.map((r) => ({ title: r.title, startDate: r.startDate, schoolClassId: r.schoolClassId || undefined })) });
        if (!res.ok || !res.duplicates) return;
        const map: Record<string, boolean> = {};
        rows.forEach((r, i) => (map[r.id] = res.duplicates![i]));
        setDuplicates(map);
        // A row that turns out to exist already cannot be imported again.
        setRows((cur) => cur.map((r) => (map[r.id] && r.include ? { ...r, include: false } : r)));
      } catch {
        // The duplicate check is a convenience; the server checks again on save.
      }
    }, 450);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dupInputKey, extracted]);

  async function readDocument() {
    if (!file || reading) return;
    setReading(true);
    setError(null);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/calendar-import/extract", { method: "POST", body });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        setError(json?.error ?? "That document could not be read.");
        return;
      }
      const events = json.events as PreviewEvent[];
      setExtracted({ method: json.method, academicYear: json.academicYear ?? "", notes: json.notes ?? [], sourceName: json.sourceName, sourceUrl: json.sourceUrl ?? null, summary: json.summary });
      // High-confidence rows start ticked; anything the reader was unsure of waits for the administrator to review and tick it.
      setRows(events.map((e) => ({ ...e, include: e.confidence === "high" && !!e.startDate, schoolClassId: "", saved: false })));
    } catch {
      setError("That document could not be read. Check your connection and try again.");
    } finally {
      setReading(false);
    }
  }

  const patch = (id: string, change: Partial<Row>) => setRows((cur) => cur.map((r) => (r.id === id ? { ...r, ...change } : r)));
  const plan = planSave(rows, duplicates);
  const button = saveButtonState(plan, { saving, audienceAcknowledged: ack, audienceNeedsAck: needsAck });
  const flaggedSelected = plan.toSave.filter((r) => r.confidence === "review").length;
  const dupCount = rows.filter((r) => duplicates[r.id] && !r.saved).length;
  const unsaved = extracted ? unsavedCount(rows, duplicates) : 0;
  const needsClassBoard = admin.isSuperAdmin ? false : !admin.schoolId;

  // Extracted rows that are not saved exist only on this screen: warn before the page is closed or reloaded, and before the dialog is closed.
  React.useEffect(() => {
    if (!open || unsaved === 0) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [open, unsaved]);

  function leaveOk(): boolean {
    if (unsaved === 0) return true;
    return window.confirm(`${unsaved} extracted event${unsaved === 1 ? " has" : "s have"} not been saved yet. If you leave now they are lost and the document must be read again.\n\nPress Cancel to stay and save them, or OK to leave without saving.`);
  }
  const requestClose = () => {
    if (reading || saving) return;
    if (leaveOk()) onClose();
  };
  const startOver = () => {
    if (saving) return;
    if (leaveOk()) reset();
  };

  async function save() {
    if (savingRef.current || !button.enabled) return;
    savingRef.current = true;
    setSaving(true);
    setError(null);
    try {
      const out = await saveDraftRows({ rows, duplicates, scope, source: { sourceName: extracted?.sourceName, sourceUrl: extracted?.sourceUrl }, save: confirmCalendarImport });
      if (out.status === "failed") {
        setError(out.error); // every row is still on screen exactly as it was: just try again
        return;
      }
      setRows(out.rows);
      setSavedTotal((t) => t + out.created);
      setLastSave({ created: out.created, skipped: out.skipped, leftOut: out.leftOut });
      showToast(`${out.created} event${out.created === 1 ? "" : "s"} saved as drafts`, out.skipped > 0 ? `${out.skipped} already existed and were skipped. Publish the drafts when you are ready.` : "Publish them on the calendar when you are ready for students to see them.");
      onImported({ created: out.created });
    } catch {
      setError("The events could not be saved just now. Everything you extracted is still here - try again.");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  const audience = [
    admin.isSuperAdmin ? (schoolId ? schools.find((s) => s.id === schoolId)?.name ?? "One school" : "All schools") : admin.schoolName ?? "Your school",
    admin.isSuperAdmin ? (boardId ? boards.find((b) => b.id === boardId)?.shortName ?? "one board" : "all boards") : null,
    classId ? classes.find((c) => c.id === classId)?.label ?? "one class" : "all classes",
  ]
    .filter(Boolean)
    .join(" · ");

  const footer = extracted ? (
    <CalendarReviewFooter button={button} saving={saving} selected={plan.toSave.length} savedCount={savedTotal} error={error} onSave={save} onStartOver={startOver} onClose={requestClose} />
  ) : undefined;

  return (
    <Modal
      open={open}
      onClose={requestClose}
      title="Import calendar"
      description="Upload a PDF or an image of the academic calendar. You review and edit what was found; events are only saved when you press Save, and only as drafts."
      className="max-w-4xl"
      footer={footer}
    >
      {!extracted ? (
        <div className="space-y-4">
          {needsClassBoard && <p className="text-sm text-gray-600 dark:text-gray-300">Your account is not attached to a school, so there is no school calendar to import into.</p>}
          <div>
            <label className={labelClass} htmlFor="calendar-file">
              Calendar document (PDF, PNG, JPEG or WebP, up to 4 MB)
            </label>
            <input
              id="calendar-file"
              type="file"
              accept="application/pdf,image/png,image/jpeg,image/webp"
              className={inputClass}
              disabled={reading || needsClassBoard}
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
                setError(null);
              }}
            />
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            A PDF with selectable text is read directly. A scan or a photo is read with OCR, which can make mistakes - every row is shown to you before anything is saved, and the original document is kept for reference.
          </p>
          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={requestClose} disabled={reading}>
              Cancel
            </Button>
            <Button onClick={readDocument} disabled={!file || reading || needsClassBoard} className="gap-1.5">
              {reading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UploadCloud className="h-3.5 w-3.5" />} {reading ? "Reading the document..." : "Read calendar"}
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {lastSave && (
            <div role="status" data-testid="calendar-save-success" className="rounded-xl border border-success-200 bg-success-50/60 p-3 text-sm dark:border-success-900 dark:bg-success-950/20">
              <p className="flex items-center gap-1.5 font-semibold text-success-700 dark:text-success-300">
                <CheckCircle2 className="h-4 w-4" /> {savedTotal} draft event{savedTotal === 1 ? "" : "s"} saved
              </p>
              <p className="mt-0.5 text-xs text-gray-600 dark:text-gray-300">
                They are drafts: students see nothing until you publish them on the calendar.
                {lastSave.skipped > 0 ? ` ${lastSave.skipped} already existed and were skipped.` : ""}
                {lastSave.leftOut > 0 ? ` ${lastSave.leftOut} ticked event${lastSave.leftOut === 1 ? " needs" : "s need"} correcting and ${lastSave.leftOut === 1 ? "was" : "were"} left out - they are still listed below.` : ""}
              </p>
              <Button type="button" size="sm" variant="outline" className="mt-2" onClick={() => { onViewDrafts(); if (leaveOk()) onClose(); }}>
                Review the saved drafts on the calendar
              </Button>
            </div>
          )}

          <div className="rounded-xl border border-gray-100 p-3 dark:border-gray-800">
            <p className="text-sm font-semibold text-gray-900 dark:text-gray-50">{summaryText(extracted.summary)}.</p>
            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
              {extracted.sourceName} - {METHOD_LABEL[extracted.method] ?? extracted.method}
              {extracted.academicYear ? ` - academic year ${extracted.academicYear}` : ""}
            </p>
            {extracted.notes.map((n) => (
              <p key={n} className="mt-1 flex items-start gap-1.5 text-xs text-warning-700 dark:text-warning-400">
                <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" /> {n}
              </p>
            ))}
            {dupCount > 0 && <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{dupCount} already {dupCount === 1 ? "exists" : "exist"} in the calendar for this audience and will not be added again.</p>}
          </div>

          <div className="space-y-3 rounded-xl border border-gray-100 p-3 dark:border-gray-800">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Who will see these events</p>
            {admin.isSuperAdmin ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className={labelClass}>School</label>
                  <select className={inputClass} value={schoolId} onChange={(e) => setSchoolId(e.target.value)} disabled={saving}>
                    <option value="">All schools (common)</option>
                    {schools.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelClass}>State</label>
                  <select className={inputClass} value={stateId} onChange={(e) => { setStateId(e.target.value); setBoardId(""); setClassId(""); }} disabled={saving}>
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
                  <select className={inputClass} value={boardId} onChange={(e) => { setBoardId(e.target.value); setClassId(""); }} disabled={saving || !stateId}>
                    <option value="">{stateId ? "All boards" : "Choose a state to pick a board"}</option>
                    {boards.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.shortName}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Class</label>
                  <select className={inputClass} value={classId} onChange={(e) => setClassId(e.target.value)} disabled={saving || !classBoardId}>
                    <option value="">{classBoardId ? "All classes" : "Choose a board to pick a class"}</option>
                    {classes.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <p className="text-sm text-gray-600 dark:text-gray-300">Your school: {admin.schoolName ?? "-"}</p>
                <div>
                  <label className={labelClass}>Class</label>
                  <select className={inputClass} value={classId} onChange={(e) => setClassId(e.target.value)} disabled={saving || !classBoardId}>
                    <option value="">All classes</option>
                    {classes.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}
            <p className="text-sm text-gray-700 dark:text-gray-200">
              <span className="text-gray-400">Visible to (once published): </span>
              {audience}
            </p>
            {needsAck && (
              <label className="flex items-start gap-2 text-xs text-warning-700 dark:text-warning-400">
                <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0" checked={ack} onChange={(e) => setAck(e.target.checked)} disabled={saving} data-testid="calendar-audience-ack" />
                <span>With no school, board or class chosen, these events will reach every student on the platform once published. I understand, and this is intended.</span>
              </label>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <label className="text-xs text-gray-500">
              Academic year for all rows
              <input
                className={`${inputClass} !mt-1 !w-28`}
                placeholder="2026-27"
                value={rows.every((r) => r.academicYear === rows[0]?.academicYear) ? rows[0]?.academicYear ?? "" : ""}
                onChange={(e) => setRows((cur) => cur.map((r) => ({ ...r, academicYear: e.target.value })))}
                disabled={saving}
              />
            </label>
            <Button size="sm" variant="outline" onClick={() => setRows((cur) => cur.map((r) => ({ ...r, include: !r.saved && !duplicates[r.id] && !rowProblem(r) && r.confidence === "high" })))} disabled={saving}>
              Tick high-confidence only
            </Button>
            <Button size="sm" variant="outline" onClick={() => setRows((cur) => cur.map((r) => ({ ...r, include: !r.saved && !duplicates[r.id] && !rowProblem(r) })))} disabled={saving}>
              Tick every valid event
            </Button>
            <Button size="sm" variant="outline" onClick={() => setRows((cur) => cur.map((r) => ({ ...r, include: false })))} disabled={saving}>
              Untick all
            </Button>
          </div>

          {plan.blocked.length > 0 && (
            <div role="alert" data-testid="calendar-blocked" className="rounded-xl border border-warning-200 bg-warning-50/60 p-3 text-xs dark:border-warning-900 dark:bg-warning-950/20">
              <p className="font-semibold text-warning-800 dark:text-warning-300">
                {plan.blocked.length} ticked event{plan.blocked.length === 1 ? " needs" : "s need"} correcting and will be left out of the save until fixed (nothing is discarded):
              </p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-gray-700 dark:text-gray-200">
                {plan.blocked.map(({ row, problem }) => (
                  <li key={row.id}>
                    &ldquo;{row.title || "Untitled"}&rdquo; - {problem}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <ul className="space-y-2">
            {rows.map((r) => {
              const dup = duplicates[r.id] === true;
              const bad = rowProblem(r);
              const done = r.saved === true;
              return (
                <li key={r.id} className={`rounded-xl border p-3 ${done ? "border-success-200 bg-success-50/30 dark:border-success-900" : r.include ? "border-primary-200 bg-primary-50/30 dark:border-primary-900 dark:bg-primary-950/20" : "border-gray-100 dark:border-gray-800"}`}>
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      className="mt-1.5 h-4 w-4 shrink-0"
                      checked={r.include}
                      disabled={tickLocked(r, { saving, duplicate: dup })}
                      onChange={(e) => patch(r.id, { include: e.target.checked })}
                      aria-label={`Save "${r.title}"`}
                    />
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {done ? <Badge variant="success">Saved as draft</Badge> : dup ? <Badge variant="outline">Already in the calendar</Badge> : r.confidence === "high" ? <Badge variant="success">High confidence</Badge> : <Badge variant="warning">Needs review</Badge>}
                        {bad && !done && <span className="text-xs text-red-600 dark:text-red-400">{bad}</span>}
                      </div>
                      <input className={inputClass} value={r.title} onChange={(e) => patch(r.id, { title: e.target.value })} disabled={saving || done} aria-label="Event title" />
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
                        <select className={inputClass} value={r.type} onChange={(e) => patch(r.id, { type: e.target.value as Row["type"] })} disabled={saving || done} aria-label="Event type">
                          {TYPES.map(([v, l]) => (
                            <option key={v} value={v}>
                              {l}
                            </option>
                          ))}
                        </select>
                        <input type="date" className={inputClass} value={r.startDate} onChange={(e) => patch(r.id, { startDate: e.target.value })} disabled={saving || done} aria-label="Start date" />
                        <input type="date" className={inputClass} value={r.endDate} min={r.startDate} onChange={(e) => patch(r.id, { endDate: e.target.value })} disabled={saving || done} aria-label="End date (optional)" />
                        <select className={inputClass} value={r.schoolClassId} onChange={(e) => patch(r.id, { schoolClassId: e.target.value })} disabled={saving || done || classes.length === 0} aria-label="Class for this row">
                          <option value="">{classId ? "Class chosen above" : "Audience chosen above"}</option>
                          {classes.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.label} only
                            </option>
                          ))}
                        </select>
                      </div>
                      <input className={inputClass} placeholder="Description (optional)" value={r.description} onChange={(e) => patch(r.id, { description: e.target.value })} disabled={saving || done} aria-label="Description" />
                      {r.warnings.map((w) => (
                        <p key={w} className="flex items-start gap-1.5 text-xs text-warning-700 dark:text-warning-400">
                          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" /> {w}
                        </p>
                      ))}
                      <p className="text-[11px] text-gray-400">From the document: &ldquo;{r.sourceText}&rdquo;</p>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
          {flaggedSelected > 0 && <p className="text-xs text-gray-500 dark:text-gray-400">{flaggedSelected} of the selected events were flagged for review and you have ticked them.</p>}
        </div>
      )}
    </Modal>
  );
}
