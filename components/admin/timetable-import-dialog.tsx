"use client";
// Import a timetable from a PDF or image: choose a file -> the document is read -> an EDITABLE preview, one card per class
// found -> the administrator reviews, corrects and presses Confirm -> only then is anything saved. Nothing is saved before
// Confirm; every row the reader was unsure of is highlighted with the reason (overlapping times, a missing day, a time that
// is not in the quoted text ...), and "how it will look" shows the week as students will see it, so a misread is easy to spot.
// The server re-validates everything on Confirm (lib/timetable/core.ts) - this screen is a convenience, not the rule.
import * as React from "react";
import { Loader2, UploadCloud, AlertTriangle, CheckCircle2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { inputClass, labelClass } from "@/components/register/field-styles";
import { WeekGrid } from "@/components/timetable/week-grid";
import { listStates, listBoards, listSchoolClasses, listSchools, listSubjectsForClass } from "@/lib/actions/curriculum";
import { confirmTimetableImport, listTimetablesForAdmin } from "@/lib/actions/timetable";
import { isValidTime, DAY_NAMES } from "@/lib/timetable/parts";
import { suggestClass, timetableSummaryText, flagOverlaps } from "@/lib/timetable/normalize";
import type { PreviewGroup, PreviewPeriod, TimetableSummary } from "@/lib/timetable/types";

type State = Awaited<ReturnType<typeof listStates>>[number];
type Board = Awaited<ReturnType<typeof listBoards>>[number];
type SchoolClass = Awaited<ReturnType<typeof listSchoolClasses>>[number];
type School = Awaited<ReturnType<typeof listSchools>>[number];
type Existing = Awaited<ReturnType<typeof listTimetablesForAdmin>>[number];

interface GroupState extends Omit<PreviewGroup, "periods"> {
  schoolClassId: string;
  replace: boolean;
  periods: PreviewPeriod[];
}

export interface TimetableAdmin {
  isSuperAdmin: boolean;
  schoolId: string | null;
  schoolName: string | null;
  schoolBoardId: string | null;
}

const METHOD_LABEL: Record<string, string> = { "text-layer": "read from the PDF's text", "text-layer+ai": "read from the PDF's text, structured by the AI reader", "ai-vision": "read as an image (OCR / document vision)" };
const normSection = (s: string) => s.replace(/^\s*(?:section|sec\.?|div\.?|division)\s*/i, "").trim().toUpperCase();

function rowProblem(p: PreviewPeriod): string | null {
  if (p.day < 1 || p.day > 7) return "Choose a day";
  if (!p.subject.trim()) return "Needs a subject";
  if (p.period && !(Number(p.period) >= 1 && Number(p.period) <= 20)) return "Period 1-20";
  if (!p.period && !p.startTime) return "Needs a period number or a time";
  if ((p.startTime && !isValidTime(p.startTime)) || (p.endTime && !isValidTime(p.endTime))) return "Use times like 09:30";
  if ((p.startTime && !p.endTime) || (!p.startTime && p.endTime)) return "Give both times or neither";
  if (p.startTime && p.endTime && p.endTime <= p.startTime) return "End must be after start";
  return null;
}

/** Re-runs the overlap check on the current edits, so a fixed time clears its warning and a new clash shows at once. */
function withOverlaps(periods: PreviewPeriod[]): PreviewPeriod[] {
  const copy = periods.map((p) => ({ ...p, warnings: p.warnings.filter((w) => !/^Overlaps the previous period/.test(w)), confidence: p.confidence }));
  flagOverlaps(copy);
  return copy;
}

export function TimetableImportDialog({ open, onClose, admin, onImported }: { open: boolean; onClose: () => void; admin: TimetableAdmin; onImported: () => void }) {
  const { showToast } = useToast();
  const [file, setFile] = React.useState<File | null>(null);
  const [reading, setReading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [meta, setMeta] = React.useState<{ method: string; notes: string[]; sourceName: string; sourceUrl: string | null; summary: TimetableSummary } | null>(null);
  const [groups, setGroups] = React.useState<GroupState[]>([]);
  const [publish, setPublish] = React.useState(true);
  const [importing, setImporting] = React.useState(false);

  const [schools, setSchools] = React.useState<School[]>([]);
  const [states, setStates] = React.useState<State[]>([]);
  const [boards, setBoards] = React.useState<Board[]>([]);
  const [classes, setClasses] = React.useState<SchoolClass[]>([]);
  const [existing, setExisting] = React.useState<Existing[]>([]);
  const [subjectNames, setSubjectNames] = React.useState<Record<string, string[]>>({});
  const [schoolId, setSchoolId] = React.useState("");
  const [stateId, setStateId] = React.useState("");
  const [boardId, setBoardId] = React.useState("");

  const reset = React.useCallback(() => {
    setFile(null);
    setReading(false);
    setError(null);
    setMeta(null);
    setGroups([]);
    setPublish(true);
    setSchoolId("");
    setStateId("");
    setBoardId("");
    setSubjectNames({});
  }, []);

  React.useEffect(() => {
    if (!open) reset();
  }, [open, reset]);

  React.useEffect(() => {
    if (!open) return;
    listTimetablesForAdmin().then(setExisting).catch(() => {});
    if (admin.isSuperAdmin) listSchools().then(setSchools).catch(() => {});
    listStates().then(setStates).catch(() => {});
  }, [open, admin.isSuperAdmin]);

  const chosenSchool = admin.isSuperAdmin ? schools.find((s) => s.id === schoolId) ?? null : null;
  const effectiveSchoolId = admin.isSuperAdmin ? schoolId : admin.schoolId ?? "";
  // The school's own board decides the classes; a school with no board set lets the administrator pick one.
  const schoolBoard = admin.isSuperAdmin ? chosenSchool?.boardId ?? null : admin.schoolBoardId;
  const classBoardId = schoolBoard ?? boardId;

  React.useEffect(() => {
    setBoards([]);
    if (schoolBoard || !stateId) return;
    listBoards(stateId).then(setBoards).catch(() => setBoards([]));
  }, [stateId, schoolBoard]);

  React.useEffect(() => {
    setClasses([]);
    if (!classBoardId) return;
    listSchoolClasses(classBoardId).then(setClasses).catch(() => setClasses([]));
  }, [classBoardId]);

  // Detected headings are matched to the school's classes once both are known (the administrator can always change it).
  React.useEffect(() => {
    if (classes.length === 0) return;
    setGroups((cur) => cur.map((g) => (g.schoolClassId ? g : { ...g, schoolClassId: suggestClass(g, classes)?.id ?? "" })));
  }, [classes, meta]);

  // The subject names of each chosen class, offered as suggestions (a subject outside the list is still allowed).
  const chosenClassIds = groups.map((g) => g.schoolClassId).filter(Boolean).join(",");
  React.useEffect(() => {
    for (const id of new Set(groups.map((g) => g.schoolClassId).filter(Boolean))) {
      if (subjectNames[id]) continue;
      listSubjectsForClass(id)
        .then((subs) => setSubjectNames((cur) => ({ ...cur, [id]: subs.map((s) => s.name) })))
        .catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chosenClassIds]);

  const needSchool = admin.isSuperAdmin && !schoolId;
  const noSchoolForAdmin = !admin.isSuperAdmin && !admin.schoolId;

  async function readDocument() {
    if (!file || reading || needSchool) return;
    setReading(true);
    setError(null);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/timetable-import/extract", { method: "POST", body });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        setError(json?.error ?? "That document could not be read.");
        return;
      }
      setMeta({ method: json.method, notes: json.notes ?? [], sourceName: json.sourceName, sourceUrl: json.sourceUrl ?? null, summary: json.summary });
      setGroups((json.groups as PreviewGroup[]).map((g) => ({ ...g, schoolClassId: "", replace: false })));
    } catch {
      setError("That document could not be read. Check your connection and try again.");
    } finally {
      setReading(false);
    }
  }

  const patchGroup = (id: string, change: Partial<GroupState>) => setGroups((cur) => cur.map((g) => (g.id === id ? { ...g, ...change } : g)));
  const patchRow = (gid: string, rid: string, change: Partial<PreviewPeriod>) =>
    setGroups((cur) => cur.map((g) => (g.id === gid ? { ...g, periods: withOverlaps(g.periods.map((p) => (p.id === rid ? { ...p, ...change } : p))) } : g)));
  const removeRow = (gid: string, rid: string) => setGroups((cur) => cur.map((g) => (g.id === gid ? { ...g, periods: withOverlaps(g.periods.filter((p) => p.id !== rid)) } : g)));
  const addRow = (gid: string) =>
    setGroups((cur) =>
      cur.map((g) => (g.id === gid ? { ...g, periods: [...g.periods, { id: `new-${Date.now()}-${g.periods.length}`, day: 1, period: "", startTime: "", endTime: "", subject: "", teacher: "", room: "", confidence: "review", warnings: ["Added by hand"], sourceText: "(added by you)" }] } : g))
    );
  const removeGroup = (gid: string) => setGroups((cur) => cur.filter((g) => g.id !== gid));

  const conflictOf = (g: GroupState) => (g.schoolClassId ? existing.find((e) => e.schoolId === effectiveSchoolId && e.schoolClassId === g.schoolClassId && e.section === normSection(g.section)) ?? null : null);
  const groupIssue = (g: GroupState): string | null => {
    if (!g.schoolClassId) return "Choose the class this timetable is for";
    if (g.periods.length === 0) return "This class has no periods";
    const bad = g.periods.find((p) => rowProblem(p));
    if (bad) return `Fix "${bad.subject || "a row"}": ${rowProblem(bad)}`;
    const c = conflictOf(g);
    if (c && !g.replace) return `${c.className}${c.section ? ` ${c.section}` : ""} already has a timetable (${c.periods} periods) - tick "Replace" or remove this class`;
    return null;
  };
  const blocking = groups.map((g) => groupIssue(g)).filter(Boolean) as string[];
  const classDup = (() => {
    const keys = groups.map((g) => `${g.schoolClassId}|${normSection(g.section)}`);
    return keys.some((k, i) => k.split("|")[0] && keys.indexOf(k) !== i);
  })();
  const flagged = groups.reduce((n, g) => n + g.periods.filter((p) => p.confidence === "review").length, 0);

  async function confirm() {
    if (importing || groups.length === 0 || blocking.length > 0 || classDup) return;
    setImporting(true);
    const res = await confirmTimetableImport({
      schoolId: admin.isSuperAdmin ? schoolId : "",
      publish,
      sourceName: meta?.sourceName,
      sourceUrl: meta?.sourceUrl ?? undefined,
      groups: groups.map((g) => ({
        schoolClassId: g.schoolClassId,
        section: g.section,
        title: g.title,
        academicYear: g.academicYear,
        replace: g.replace,
        periods: g.periods.map((p) => ({ day: p.day, period: p.period ? Number(p.period) : null, startTime: p.startTime || null, endTime: p.endTime || null, subject: p.subject, teacher: p.teacher, room: p.room })),
      })),
    });
    setImporting(false);
    if (!res.ok || !res.data) {
      setError(res.error ?? "The import could not be completed.");
      return;
    }
    const n = res.data.timetables.length;
    showToast(`${n} timetable${n === 1 ? "" : "s"} ${publish ? "published" : "saved as drafts"}`, publish ? "Students of those classes can see them under Timetable." : "Publish them from the Timetables tab when you are ready.");
    onImported();
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={() => (reading || importing ? undefined : onClose())}
      title="Import timetable"
      description="Upload a PDF or an image of a timetable. You review and correct what was found; nothing is saved until you confirm."
      className="max-w-5xl"
    >
      {groups.length === 0 || !meta ? (
        <div className="space-y-4">
          {noSchoolForAdmin && <p className="text-sm text-gray-600 dark:text-gray-300">Your account is not attached to a school, so there is no school timetable to import into.</p>}
          {admin.isSuperAdmin && (
            <div>
              <label className={labelClass}>School</label>
              <select className={inputClass} value={schoolId} onChange={(e) => setSchoolId(e.target.value)} disabled={reading}>
                <option value="">Choose the school this timetable belongs to</option>
                {schools.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          {!admin.isSuperAdmin && <p className="text-sm text-gray-600 dark:text-gray-300">School: {admin.schoolName ?? "-"}</p>}
          <div>
            <label className={labelClass} htmlFor="timetable-file">
              Timetable document (PDF, PNG, JPEG or WebP, up to 4 MB)
            </label>
            <input id="timetable-file" type="file" accept="application/pdf,image/png,image/jpeg,image/webp" className={inputClass} disabled={reading || noSchoolForAdmin} onChange={(e) => { setFile(e.target.files?.[0] ?? null); setError(null); }} />
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            A PDF with selectable text is read directly. A scan or a photo is read with OCR, which can make mistakes - every period is shown to you before anything is saved, and the original document is kept for reference. A document with several classes is split into one timetable per class.
          </p>
          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose} disabled={reading}>
              Cancel
            </Button>
            <Button onClick={readDocument} disabled={!file || reading || needSchool || noSchoolForAdmin} className="gap-1.5">
              {reading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UploadCloud className="h-3.5 w-3.5" />} {reading ? "Reading the document..." : "Read timetable"}
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="rounded-xl border border-gray-100 p-3 dark:border-gray-800">
            <p className="text-sm font-semibold text-gray-900 dark:text-gray-50">{timetableSummaryText(meta.summary)}.</p>
            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
              {meta.sourceName} - {METHOD_LABEL[meta.method] ?? meta.method}
            </p>
            {meta.notes.map((n) => (
              <p key={n} className="mt-1 flex items-start gap-1.5 text-xs text-warning-700 dark:text-warning-400">
                <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" /> {n}
              </p>
            ))}
          </div>

          {!schoolBoard && (
            <div className="grid grid-cols-1 gap-3 rounded-xl border border-gray-100 p-3 dark:border-gray-800 sm:grid-cols-2">
              <p className="text-xs text-warning-700 dark:text-warning-400 sm:col-span-2">This school has no board set, so choose the board whose classes these timetables belong to.</p>
              <div>
                <label className={labelClass}>State</label>
                <select className={inputClass} value={stateId} onChange={(e) => { setStateId(e.target.value); setBoardId(""); }} disabled={importing}>
                  <option value="">Choose a state</option>
                  {states.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelClass}>Board</label>
                <select className={inputClass} value={boardId} onChange={(e) => setBoardId(e.target.value)} disabled={importing || !stateId}>
                  <option value="">{stateId ? "Choose a board" : "Choose a state first"}</option>
                  {boards.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.shortName}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          <div className="max-h-[52vh] space-y-4 overflow-y-auto pr-1">
            {groups.map((g) => {
              const issue = groupIssue(g);
              const conflict = conflictOf(g);
              return (
                <section key={g.id} className="space-y-3 rounded-2xl border border-gray-100 p-3 dark:border-gray-800">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-50">Detected: {g.className || "no class heading in the document"}</p>
                    {groups.length > 1 && (
                      <Button size="sm" variant="ghost" onClick={() => removeGroup(g.id)} disabled={importing}>
                        Leave this class out
                      </Button>
                    )}
                  </div>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
                    <div className="sm:col-span-2">
                      <label className={labelClass}>Class</label>
                      <select className={inputClass} value={g.schoolClassId} onChange={(e) => patchGroup(g.id, { schoolClassId: e.target.value })} disabled={importing || classes.length === 0}>
                        <option value="">{classes.length === 0 ? (needSchool ? "Choose a school first" : "No classes available") : "Choose the class"}</option>
                        {classes.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className={labelClass}>Section (optional)</label>
                      <input className={inputClass} value={g.section} maxLength={10} placeholder="A" onChange={(e) => patchGroup(g.id, { section: e.target.value })} disabled={importing} />
                    </div>
                    <div>
                      <label className={labelClass}>Academic year</label>
                      <input className={inputClass} value={g.academicYear} placeholder="2026-27" onChange={(e) => patchGroup(g.id, { academicYear: e.target.value })} disabled={importing} />
                    </div>
                  </div>
                  <input className={inputClass} value={g.title} placeholder="Title (optional), for example Term 1 timetable" onChange={(e) => patchGroup(g.id, { title: e.target.value })} disabled={importing} aria-label="Timetable title" />
                  {conflict && (
                    <label className="flex items-start gap-2 rounded-lg bg-warning-50 p-2 text-xs text-warning-800 dark:bg-warning-950/30 dark:text-warning-300">
                      <input type="checkbox" className="mt-0.5" checked={g.replace} onChange={(e) => patchGroup(g.id, { replace: e.target.checked })} disabled={importing} />
                      {conflict.className}
                      {conflict.section ? ` ${conflict.section}` : ""} already has a timetable ({conflict.periods} periods, {conflict.isPublished ? "published" : "draft"}). Tick to REPLACE it with this one.
                    </label>
                  )}
                  {g.notes.map((n) => (
                    <p key={n} className="flex items-start gap-1.5 text-xs text-warning-700 dark:text-warning-400">
                      <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" /> {n}
                    </p>
                  ))}

                  <datalist id={`subjects-${g.id}`}>
                    {(subjectNames[g.schoolClassId] ?? []).map((n) => (
                      <option key={n} value={n} />
                    ))}
                  </datalist>
                  <ul className="space-y-2">
                    {g.periods.map((p) => {
                      const bad = rowProblem(p);
                      return (
                        <li key={p.id} className={`rounded-xl border p-2 ${p.confidence === "review" || bad ? "border-warning-300 bg-warning-50/40 dark:border-warning-700 dark:bg-warning-950/10" : "border-gray-100 dark:border-gray-800"}`}>
                          <div className="grid grid-cols-2 gap-2 sm:grid-cols-12">
                            <select className={`${inputClass} sm:col-span-2`} value={p.day} onChange={(e) => patchRow(g.id, p.id, { day: Number(e.target.value) })} disabled={importing} aria-label="Day">
                              <option value={0}>Day?</option>
                              {DAY_NAMES.slice(1).map((d, i) => (
                                <option key={d} value={i + 1}>
                                  {d}
                                </option>
                              ))}
                            </select>
                            <input className={`${inputClass} sm:col-span-1`} value={p.period} inputMode="numeric" placeholder="Pd" onChange={(e) => patchRow(g.id, p.id, { period: e.target.value.replace(/\D/g, "").slice(0, 2) })} disabled={importing} aria-label="Period number" />
                            <input type="time" className={`${inputClass} sm:col-span-2`} value={p.startTime} onChange={(e) => patchRow(g.id, p.id, { startTime: e.target.value })} disabled={importing} aria-label="Start time" />
                            <input type="time" className={`${inputClass} sm:col-span-2`} value={p.endTime} onChange={(e) => patchRow(g.id, p.id, { endTime: e.target.value })} disabled={importing} aria-label="End time" />
                            <input className={`${inputClass} col-span-2 sm:col-span-3`} list={`subjects-${g.id}`} value={p.subject} placeholder="Subject" maxLength={100} onChange={(e) => patchRow(g.id, p.id, { subject: e.target.value })} disabled={importing} aria-label="Subject" />
                            <Button size="sm" variant="ghost" className="sm:col-span-2" onClick={() => removeRow(g.id, p.id)} disabled={importing} aria-label={`Remove ${p.subject || "this row"}`}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                            <input className={`${inputClass} col-span-1 sm:col-span-6`} value={p.teacher} placeholder="Teacher (if shown)" maxLength={100} onChange={(e) => patchRow(g.id, p.id, { teacher: e.target.value })} disabled={importing} aria-label="Teacher" />
                            <input className={`${inputClass} col-span-1 sm:col-span-3`} value={p.room} placeholder="Room (if shown)" maxLength={30} onChange={(e) => patchRow(g.id, p.id, { room: e.target.value })} disabled={importing} aria-label="Room" />
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-1.5">
                            {p.confidence === "high" && !bad ? <Badge variant="success">High confidence</Badge> : <Badge variant="warning">Check this row</Badge>}
                            {bad && <span className="text-xs text-red-600 dark:text-red-400">{bad}</span>}
                          </div>
                          {p.warnings.map((w) => (
                            <p key={w} className="mt-0.5 flex items-start gap-1.5 text-xs text-warning-700 dark:text-warning-400">
                              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" /> {w}
                            </p>
                          ))}
                          <p className="mt-0.5 text-[11px] text-gray-400">From the document: &ldquo;{p.sourceText}&rdquo;</p>
                        </li>
                      );
                    })}
                  </ul>
                  <Button size="sm" variant="outline" className="gap-1.5" onClick={() => addRow(g.id)} disabled={importing || g.periods.length >= 80}>
                    <Plus className="h-3.5 w-3.5" /> Add a period
                  </Button>

                  <details className="rounded-xl border border-gray-100 p-2 dark:border-gray-800">
                    <summary className="cursor-pointer text-sm font-medium text-gray-700 dark:text-gray-200">How it will look</summary>
                    <div className="mt-2">
                      <WeekGrid
                        entries={g.periods
                          .filter((p) => p.day >= 1 && p.subject.trim())
                          .map((p) => ({ id: p.id, day: p.day, period: p.period ? Number(p.period) : null, startTime: p.startTime || null, endTime: p.endTime || null, subjectName: p.subject, teacherName: p.teacher || null, room: p.room || null, flagged: p.confidence === "review" || rowProblem(p) !== null }))}
                      />
                    </div>
                  </details>
                  {issue && <p className="text-xs font-medium text-red-600 dark:text-red-400">{issue}</p>}
                </section>
              );
            })}
          </div>

          <label className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-200">
            <input type="checkbox" className="mt-1" checked={publish} onChange={(e) => setPublish(e.target.checked)} disabled={importing} />
            Publish now - the students of each class can see their timetable straight away (untick to save as drafts and publish later)
          </label>
          {classDup && <p className="text-xs font-medium text-red-600 dark:text-red-400">Two of these are for the same class and section - change one.</p>}
          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          <div className="flex flex-col gap-2 border-t border-gray-100 pt-3 dark:border-gray-800 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {blocking.length > 0 ? `${blocking.length} class${blocking.length === 1 ? "" : "es"} still need${blocking.length === 1 ? "s" : ""} attention before you can import.` : flagged > 0 ? `${flagged} row${flagged === 1 ? " is" : "s are"} still highlighted - make sure you have checked them against the document.` : "Everything looks consistent."}
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={reset} disabled={importing}>
                Start over
              </Button>
              <Button onClick={confirm} disabled={importing || blocking.length > 0 || classDup || groups.length === 0} className="gap-1.5">
                {importing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />} {importing ? "Importing..." : `Confirm and import ${groups.length} timetable${groups.length === 1 ? "" : "s"}`}
              </Button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
