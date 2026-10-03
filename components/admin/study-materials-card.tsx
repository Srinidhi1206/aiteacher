"use client";
// Stage I: rewired from Step 1/2 mock/local-state simulation to the real
// Stage C material pipeline (lib/actions/materials.ts + lib/storage/*).
// Client component fetching via server actions directly (same pattern as
// components/admin/users-table.tsx / platform-analytics.tsx) since this
// lives inside AdminTabs' client boundary.
import * as React from "react";
import { upload as uploadToBlob } from "@vercel/blob/client";
import { UploadCloud, FileText, CheckCircle2, AlertTriangle, Trash2, DatabaseZap, Sparkles, Loader2 } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { inputClass, labelClass } from "@/components/register/field-styles";
import { formatDate, cn } from "@/lib/utils";
import { listStates, listBoards, listSchools, listSchoolClasses, listSubjectsForClass, listChaptersForSubject } from "@/lib/actions/curriculum";
import { createMaterial, setMaterialPublished, deleteMaterial, listMaterialsForAdmin } from "@/lib/actions/materials";
import { indexMaterial } from "@/lib/actions/material-index";
import { parseIndexStatus } from "@/lib/rag/index-status";
import { importMaterialFromUrl } from "@/lib/actions/material-import";
import { getMyAdminStatus } from "@/lib/actions/user-management";
import { ALLOWED_MIME_TYPES, MAX_UPLOAD_BYTES, validateUploadFile, safeFilename } from "@/lib/storage/types";

type State = Awaited<ReturnType<typeof listStates>>[number];
type Board = Awaited<ReturnType<typeof listBoards>>[number];
type SchoolClass = Awaited<ReturnType<typeof listSchoolClasses>>[number];
type Subject = Awaited<ReturnType<typeof listSubjectsForClass>>[number];
type Chapter = Awaited<ReturnType<typeof listChaptersForSubject>>[number];
type MaterialRow = Awaited<ReturnType<typeof listMaterialsForAdmin>>[number];
type SchoolOption = Awaited<ReturnType<typeof listSchools>>[number];

const MATERIAL_TYPES = ["TEXTBOOK", "NOTES", "REFERENCE", "VIDEO", "PDF", "PRESENTATION", "OTHER"] as const;

// Materials indexed before the per-material ceiling replaced the old 400-passage cap carry no status
// note; exactly 400 passages is the signature of one that may have been cut short.
const LEGACY_PASSAGE_CAP = 400;

interface IndexView {
  label: string;
  tone: "ok" | "partial" | "idle";
  action: { label: string; rebuild: boolean } | null;
}

/** What the indexing state of a material means, in words an admin can act on. */
function describeIndex(m: MaterialRow): IndexView {
  const saved = m._count.chunks;
  const note = parseIndexStatus(m.indexError);
  if (m.indexedAt) {
    if (note?.kind === "truncated") {
      return { label: `Partially indexed: first ${note.done} of ${note.available} passages (per-material limit)`, tone: "partial", action: null };
    }
    if (note?.kind === "complete") {
      return { label: `Complete: AI Tutor ready (${saved} / ${note.total} passages)`, tone: "ok", action: { label: "Re-index", rebuild: true } };
    }
    if (!note && saved === LEGACY_PASSAGE_CAP) {
      return {
        label: `Indexed ${saved} passages - a long book may be incomplete`,
        tone: "partial",
        action: { label: "Continue indexing", rebuild: false },
      };
    }
    return { label: `Complete: AI Tutor ready (${saved} / ${saved} passages)`, tone: "ok", action: { label: "Re-index", rebuild: true } };
  }
  if (note?.kind === "in_progress" || saved > 0) {
    const total = note?.kind === "in_progress" ? ` / ${note.total}` : "";
    return { label: `Partially indexed: ${saved}${total} passages`, tone: "partial", action: { label: "Continue indexing", rebuild: false } };
  }
  if (m.indexError) return { label: m.indexError, tone: "idle", action: { label: "Try again", rebuild: false } };
  return { label: "Not yet searchable by the AI Tutor", tone: "idle", action: { label: "Index for AI Tutor", rebuild: false } };
}

export function StudyMaterialsCard() {
  const { showToast } = useToast();

  // Curriculum cascade
  const [states, setStates] = React.useState<State[]>([]);
  const [boards, setBoards] = React.useState<Board[]>([]);
  const [classes, setClasses] = React.useState<SchoolClass[]>([]);
  const [subjects, setSubjects] = React.useState<Subject[]>([]);
  const [chapters, setChapters] = React.useState<Chapter[]>([]);
  const [stateId, setStateId] = React.useState("");
  const [boardId, setBoardId] = React.useState("");
  const [schoolClassId, setSchoolClassId] = React.useState("");
  const [subjectId, setSubjectId] = React.useState("");
  const [chapterId, setChapterId] = React.useState("");
  const [topicId, setTopicId] = React.useState("");

  // Form fields
  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [materialType, setMaterialType] = React.useState<(typeof MATERIAL_TYPES)[number]>("NOTES");
  const [file, setFile] = React.useState<File | null>(null);
  const [uploading, setUploading] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);
  const [mode, setMode] = React.useState<"upload" | "url">("upload");
  const [importUrl, setImportUrl] = React.useState("");
  const [rightsConfirmed, setRightsConfirmed] = React.useState(false);

  // Materials list
  const [materials, setMaterials] = React.useState<MaterialRow[] | null>(null);
  const [dbUnavailable, setDbUnavailable] = React.useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = React.useState<string | null>(null);
  const [indexingId, setIndexingId] = React.useState<string | null>(null);
  const [indexProgress, setIndexProgress] = React.useState<{ done: number; total: number | null } | null>(null);
  // Materials belong to a school. A school administrator always uploads to their own school. The
  // platform super administrator is not attached to one, so they choose an existing school instead.
  // Any other admin with no school has nothing to upload to - say so instead of showing a form that
  // can only fail.
  const [noSchool, setNoSchool] = React.useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = React.useState(false);
  const [schools, setSchools] = React.useState<SchoolOption[]>([]);
  const [schoolId, setSchoolId] = React.useState("");

  React.useEffect(() => {
    getMyAdminStatus()
      .then((me) => {
        setIsSuperAdmin(me?.isSuperAdmin === true);
        setNoSchool(me !== null && me.schoolId === null && !me.isSuperAdmin);
        if (me?.isSuperAdmin) listSchools().then(setSchools).catch(() => {});
      })
      .catch(() => {});
  }, []);

  const refreshMaterials = React.useCallback(() => {
    listMaterialsForAdmin()
      .then((rows) => {
        setMaterials(rows);
        setDbUnavailable(false);
      })
      .catch(() => setDbUnavailable(true));
  }, []);

  React.useEffect(() => {
    listStates().then(setStates).catch(() => setDbUnavailable(true));
    refreshMaterials();
  }, [refreshMaterials]);

  React.useEffect(() => {
    setBoardId("");
    setBoards([]);
    if (!stateId) return;
    listBoards(stateId).then(setBoards).catch(() => setDbUnavailable(true));
  }, [stateId]);

  React.useEffect(() => {
    setSchoolClassId("");
    setClasses([]);
    if (!boardId) return;
    listSchoolClasses(boardId).then(setClasses).catch(() => setDbUnavailable(true));
  }, [boardId]);

  React.useEffect(() => {
    setSubjectId("");
    setSubjects([]);
    if (!schoolClassId) return;
    listSubjectsForClass(schoolClassId).then(setSubjects).catch(() => setDbUnavailable(true));
  }, [schoolClassId]);

  React.useEffect(() => {
    setChapterId("");
    setTopicId("");
    setChapters([]);
    if (!subjectId) return;
    listChaptersForSubject(subjectId).then(setChapters).catch(() => setDbUnavailable(true));
  }, [subjectId]);

  const topics = chapters.find((c) => c.id === chapterId)?.topics ?? [];

  function resetForm() {
    setTitle("");
    setDescription("");
    setMaterialType("NOTES");
    setFile(null);
    setImportUrl("");
    setRightsConfirmed(false);
    setFormError(null);
  }

  async function handleImport() {
    if (!title.trim()) return setFormError("Title is required.");
    if (isSuperAdmin && !schoolId) return setFormError("Choose the school this material belongs to.");
    if (!boardId || !schoolClassId || !subjectId || !chapterId) return setFormError("Select board, class, subject, and chapter.");
    if (!importUrl.trim()) return setFormError("Enter the web address of a PDF file.");
    if (!rightsConfirmed) return setFormError("Please confirm that you have the right to use this file.");
    setUploading(true);
    try {
      const result = await importMaterialFromUrl({
        url: importUrl,
        rightsConfirmed,
        title,
        description: description || undefined,
        materialType,
        boardId,
        schoolClassId,
        subjectId,
        chapterId,
        topicId: topicId || undefined,
        schoolId: isSuperAdmin ? schoolId : undefined,
      });
      if (!result.ok) {
        setFormError(result.error ?? "Import failed.");
        return;
      }
      const importedTitle = title;
      showToast(`Imported "${importedTitle}"`, "The material is now visible to students once published.");
      resetForm();
      refreshMaterials();
      if (result.data) void runIndex(result.data.id, importedTitle);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Import failed.");
    } finally {
      setUploading(false);
    }
  }

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (mode === "url") return handleImport();

    if (!title.trim()) return setFormError("Title is required.");
    if (isSuperAdmin && !schoolId) return setFormError("Choose the school this material belongs to.");
    if (!boardId || !schoolClassId || !subjectId || !chapterId) return setFormError("Select board, class, subject, and chapter.");
    if (!file) return setFormError("Choose a file to upload.");
    const fileCheck = validateUploadFile({ type: file.type, size: file.size });
    if (!fileCheck.ok) return setFormError(fileCheck.error);

    setUploading(true);
    try {
      // Uploads directly from the browser to Vercel Blob via a short-lived
      // token from /api/materials/upload - the file's bytes never pass
      // through a Server Action or serverless function body, which is what
      // blocked a real, large textbook PDF before (Next's ~1MB Server
      // Action limit and Vercel's ~4.5MB request body limit, both far
      // smaller than MAX_UPLOAD_BYTES ever was). createMaterial only
      // receives the resulting pathname and independently re-verifies the
      // upload server-side - see lib/actions/materials.ts.
      const blob = await uploadToBlob(
        `materials/${schoolClassId}/${subjectId}/${Date.now()}-${safeFilename(file.name)}`,
        file,
        { access: "public", contentType: file.type, handleUploadUrl: "/api/materials/upload" }
      );
      const result = await createMaterial(
        {
          title,
          description: description || undefined,
          materialType,
          boardId,
          schoolClassId,
          subjectId,
          chapterId,
          topicId: topicId || undefined,
          schoolId: isSuperAdmin ? schoolId : undefined,
        },
        { storageKey: blob.pathname, fileName: file.name }
      );
      if (!result.ok) {
        setFormError(result.error ?? "Upload failed.");
        return;
      }
      showToast(`Uploaded "${title}"`, "The material is now visible to students once published.");
      const uploadedTitle = title;
      resetForm();
      refreshMaterials();
      // Make it searchable for the AI Tutor right away (runs on its own request,
      // so a slow or failing index never blocks or fails the upload itself).
      if (result.data && file.name.toLowerCase().endsWith(".pdf")) void runIndex(result.data.id, uploadedTitle);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  async function runIndex(id: string, materialTitle: string, opts?: { rebuild?: boolean; savedSoFar?: number }) {
    setIndexingId(id);
    setIndexProgress({ done: opts?.savedSoFar ?? 0, total: null });
    // Only the first call may rebuild from scratch; every later call resumes from what is saved.
    let res = await indexMaterial(id, opts?.rebuild ? { rebuild: true } : undefined);
    // A long book takes several calls because the AI provider limits how many passages it processes
    // per minute; each call saves what it finished, so keep going until it reports complete. An
    // interrupted run is picked up again by "Continue indexing" - nothing saved is re-embedded.
    for (let round = 0; round < 40 && res.ok && res.data && !res.data.complete; round++) {
      const { chunks, total, waitMs } = res.data;
      setIndexProgress({ done: chunks, total });
      await new Promise((r) => setTimeout(r, waitMs));
      res = await indexMaterial(id);
    }
    setIndexingId(null);
    setIndexProgress(null);
    if (res.ok && res.data?.complete && res.data.available > res.data.total) {
      showToast("Indexed part of this material", `Only the first ${res.data.total} of ${res.data.available} passages fit the per-material limit.`);
    } else if (res.ok && res.data?.complete) {
      showToast("AI Tutor can now use this material", `"${materialTitle}" is fully indexed (${res.data.chunks} / ${res.data.total} passages).`);
    } else if (res.ok) {
      showToast("Indexing is not finished yet", "Click \"Continue indexing\" to carry on from where it stopped.");
    } else showToast("Could not index for the AI Tutor", res.error ?? "");
    refreshMaterials();
  }

  async function handleTogglePublish(m: MaterialRow) {
    const result = await setMaterialPublished(m.id, !m.isPublished);
    if (!result.ok) {
      showToast("Could not update", result.error ?? "");
      return;
    }
    refreshMaterials();
  }

  async function handleDelete(id: string, title: string) {
    const result = await deleteMaterial(id);
    setConfirmDeleteId(null);
    if (!result.ok) {
      showToast("Could not delete", result.error ?? "");
      return;
    }
    showToast(`Deleted "${title}"`);
    refreshMaterials();
  }

  if (noSchool) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UploadCloud className="h-4 w-4 text-primary-500" /> Study Materials
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Study materials belong to a school. Your account is not attached to a school, so there is nothing to upload to here. Sign in as a school
            administrator to upload, import and manage a school&apos;s materials.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UploadCloud className="h-4 w-4 text-primary-500" /> Study Materials
        </CardTitle>
        <CardDescription className="hidden sm:block">
          Upload real, curriculum-tagged material - visible to students in the matching class once published.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleUpload} className="space-y-3">
          {isSuperAdmin && (
            <div>
              <label className={labelClass}>School</label>
              <select className={inputClass} value={schoolId} onChange={(e) => setSchoolId(e.target.value)} disabled={uploading}>
                <option value="">Select the school this material belongs to</option>
                {schools.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Only students of this school (in the matching board and class) will see the material.
              </p>
            </div>
          )}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className={labelClass}>Title</label>
              <input className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} disabled={uploading} />
            </div>
            <div>
              <label className={labelClass}>Material type</label>
              <select className={inputClass} value={materialType} onChange={(e) => setMaterialType(e.target.value as typeof materialType)} disabled={uploading}>
                {MATERIAL_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t.charAt(0) + t.slice(1).toLowerCase()}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className={labelClass}>Description (optional)</label>
            <textarea className={inputClass} rows={2} value={description} onChange={(e) => setDescription(e.target.value)} disabled={uploading} />
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div>
              <label className={labelClass}>State</label>
              <select className={`${inputClass} !py-2 !text-xs`} value={stateId} onChange={(e) => setStateId(e.target.value)} disabled={uploading}>
                <option value="">Select</option>
                {states.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>Board</label>
              <select className={`${inputClass} !py-2 !text-xs`} value={boardId} onChange={(e) => setBoardId(e.target.value)} disabled={uploading || !stateId}>
                <option value="">Select</option>
                {boards.map((b) => (
                  <option key={b.id} value={b.id}>{b.shortName}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>Class</label>
              <select className={`${inputClass} !py-2 !text-xs`} value={schoolClassId} onChange={(e) => setSchoolClassId(e.target.value)} disabled={uploading || !boardId}>
                <option value="">Select</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>{c.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>Subject</label>
              <select className={`${inputClass} !py-2 !text-xs`} value={subjectId} onChange={(e) => setSubjectId(e.target.value)} disabled={uploading || !schoolClassId}>
                <option value="">Select</option>
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>Chapter</label>
              <select className={`${inputClass} !py-2 !text-xs`} value={chapterId} onChange={(e) => setChapterId(e.target.value)} disabled={uploading || !subjectId}>
                <option value="">Select</option>
                {chapters.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>Topic (optional)</label>
              <select className={`${inputClass} !py-2 !text-xs`} value={topicId} onChange={(e) => setTopicId(e.target.value)} disabled={uploading || !chapterId}>
                <option value="">Select</option>
                {topics.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex gap-1 rounded-lg bg-gray-100 p-1 text-xs font-medium dark:bg-gray-800" role="tablist" aria-label="How to add the material">
            {(
              [
                ["upload", "Upload a file"],
                ["url", "Import from a web address"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={mode === value}
                disabled={uploading}
                onClick={() => {
                  setMode(value);
                  setFormError(null);
                }}
                className={cn(
                  "flex-1 rounded-md px-2 py-1.5 transition-colors",
                  mode === value ? "bg-white text-primary-700 shadow-sm dark:bg-gray-900 dark:text-primary-300" : "text-gray-500 hover:text-gray-700 dark:text-gray-400"
                )}
              >
                {label}
              </button>
            ))}
          </div>

          {mode === "upload" ? (
            <label
              className={cn(
                "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-6 text-center transition-colors",
                "border-gray-200 hover:border-primary-300 dark:border-gray-700"
              )}
            >
              <UploadCloud className="h-7 w-7 text-gray-400" />
              <p className="text-sm font-medium text-gray-700 dark:text-gray-200">{file ? file.name : "Click to choose a file"}</p>
              <p className="text-xs text-gray-400">PDF, Word, PowerPoint, images, or video, up to {MAX_UPLOAD_BYTES / (1024 * 1024)}MB</p>
              <input
                type="file"
                className="hidden"
                accept={ALLOWED_MIME_TYPES.join(",")}
                disabled={uploading}
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </label>
          ) : (
            <div className="space-y-2 rounded-xl border border-gray-200 p-3 dark:border-gray-700">
              <div>
                <label className={labelClass}>Web address of a PDF</label>
                <input
                  className={inputClass}
                  type="url"
                  inputMode="url"
                  placeholder="https://example.org/path/to/book.pdf"
                  value={importUrl}
                  onChange={(e) => setImportUrl(e.target.value)}
                  disabled={uploading}
                />
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Paste a direct link to a single PDF (https only, up to 25MB). Pages that need a sign-in or permission cannot be imported - download those
                yourself and use the upload option instead.
              </p>
              <label className="flex items-start gap-2 text-xs text-gray-700 dark:text-gray-200">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={rightsConfirmed}
                  onChange={(e) => setRightsConfirmed(e.target.checked)}
                  disabled={uploading}
                />
                <span>I confirm this file is freely available or that I have the right to use it for teaching.</span>
              </label>
            </div>
          )}

          {formError && <p className="text-sm text-red-600 dark:text-red-400">{formError}</p>}

          <Button type="submit" disabled={uploading} className="w-full">
            {uploading ? (mode === "url" ? "Importing..." : "Uploading...") : mode === "url" ? "Import material" : "Upload material"}
          </Button>
        </form>

        <div className="mt-6 border-t border-gray-100 pt-4 dark:border-gray-800">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">Existing materials</p>
          {dbUnavailable ? (
            <div className="flex items-center gap-2.5 rounded-xl border border-gray-100 p-3 text-sm text-gray-500 dark:border-gray-800 dark:text-gray-400">
              <DatabaseZap className="h-4 w-4 shrink-0 text-gray-300 dark:text-gray-600" />
              Materials couldn&apos;t be loaded right now. Refresh the page in a moment.
            </div>
          ) : materials === null ? (
            <p className="py-4 text-center text-sm text-gray-400">Loading...</p>
          ) : materials.length === 0 ? (
            <p className="py-4 text-center text-sm text-gray-400">No materials uploaded yet.</p>
          ) : (
            <div className="space-y-2">
              {materials.map((m) => (
                <div key={m.id} className="flex items-start justify-between gap-2 rounded-xl border border-gray-100 p-3 dark:border-gray-800">
                  <div className="flex items-start gap-2.5">
                    <FileText className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                    <div>
                      <p className="text-sm font-medium text-gray-800 dark:text-gray-100">{m.title}</p>
                      <p className="text-xs text-gray-400">
                        {isSuperAdmin ? `${m.school.name} - ` : ""}{m.subject.name} - {m.schoolClass.label} - {m.chapter.name} -{(m.sizeKb / 1024).toFixed(1)} MB - {formatDate(m.uploadedAt)}
                      </p>
                      {(() => {
                        const idx = describeIndex(m);
                        const isPdf = m.fileName.toLowerCase().endsWith(".pdf");
                        return (
                          <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
                            {indexingId === m.id ? (
                              <span className="flex items-center gap-1 text-gray-500">
                                <Loader2 className="h-3 w-3 animate-spin" /> Indexing for the AI Tutor...
                                {indexProgress && indexProgress.done > 0
                                  ? ` ${indexProgress.done}${indexProgress.total ? ` / ${indexProgress.total}` : ""} passages`
                                  : ""}
                              </span>
                            ) : (
                              <span
                                className={cn(
                                  "flex items-center gap-1",
                                  idx.tone === "ok" && "text-success-600 dark:text-success-400",
                                  idx.tone === "partial" && "text-warning-600 dark:text-warning-400",
                                  idx.tone === "idle" && "text-gray-400"
                                )}
                              >
                                {idx.tone === "ok" && <Sparkles className="h-3 w-3" />}
                                {idx.tone === "partial" && <AlertTriangle className="h-3 w-3" />}
                                {idx.label}
                              </span>
                            )}
                            {indexingId !== m.id && isPdf && idx.action && (
                              <button
                                onClick={() => runIndex(m.id, m.title, { rebuild: idx.action!.rebuild, savedSoFar: m._count.chunks })}
                                className="font-medium text-primary-600 hover:underline dark:text-primary-300"
                              >
                                {idx.action.label}
                              </button>
                            )}
                          </p>
                        );
                      })()}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="flex items-center gap-1 text-xs font-medium text-gray-500 dark:text-gray-400">
                      {m.isPublished ? <CheckCircle2 className="h-3.5 w-3.5 text-success-500" /> : <AlertTriangle className="h-3.5 w-3.5 text-warning-500" />}
                      {m.isPublished ? "Published" : "Draft"}
                    </span>
                    <Switch checked={m.isPublished} onCheckedChange={() => handleTogglePublish(m)} aria-label={`Publish "${m.title}"`} />
                    {confirmDeleteId === m.id ? (
                      <div className="flex items-center gap-1">
                        <button onClick={() => handleDelete(m.id, m.title)} className="rounded-lg px-1.5 py-1 text-[11px] font-semibold text-red-600 hover:bg-red-50 dark:hover:bg-red-950">
                          Confirm
                        </button>
                        <button onClick={() => setConfirmDeleteId(null)} className="rounded-lg px-1.5 py-1 text-[11px] text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800">
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmDeleteId(m.id)}
                        aria-label={`Delete "${m.title}"`}
                        className="rounded-lg p-1.5 text-gray-300 hover:bg-gray-100 hover:text-red-500 dark:hover:bg-gray-800"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
          {!dbUnavailable && (
            <Badge variant="outline" className="mt-2">
              {materials?.length ?? 0} total
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
