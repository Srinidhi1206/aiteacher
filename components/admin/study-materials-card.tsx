"use client";
// Stage I: rewired from Step 1/2 mock/local-state simulation to the real
// Stage C material pipeline (lib/actions/materials.ts + lib/storage/*).
// Client component fetching via server actions directly (same pattern as
// components/admin/users-table.tsx / platform-analytics.tsx) since this
// lives inside AdminTabs' client boundary.
import * as React from "react";
import { UploadCloud, FileText, CheckCircle2, AlertTriangle, Trash2, DatabaseZap } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { inputClass, labelClass } from "@/components/register/field-styles";
import { formatDate, cn } from "@/lib/utils";
import { listStates, listBoards, listSchoolClasses, listSubjectsForClass, listChaptersForSubject } from "@/lib/actions/curriculum";
import { createMaterial, setMaterialPublished, deleteMaterial, listMaterialsForAdmin } from "@/lib/actions/materials";
import { ALLOWED_MIME_TYPES, MAX_UPLOAD_BYTES, validateUploadFile } from "@/lib/storage/types";

type State = Awaited<ReturnType<typeof listStates>>[number];
type Board = Awaited<ReturnType<typeof listBoards>>[number];
type SchoolClass = Awaited<ReturnType<typeof listSchoolClasses>>[number];
type Subject = Awaited<ReturnType<typeof listSubjectsForClass>>[number];
type Chapter = Awaited<ReturnType<typeof listChaptersForSubject>>[number];
type MaterialRow = Awaited<ReturnType<typeof listMaterialsForAdmin>>[number];

const MATERIAL_TYPES = ["TEXTBOOK", "NOTES", "REFERENCE", "VIDEO", "PDF", "PRESENTATION", "OTHER"] as const;

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

  // Materials list
  const [materials, setMaterials] = React.useState<MaterialRow[] | null>(null);
  const [dbUnavailable, setDbUnavailable] = React.useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = React.useState<string | null>(null);

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
    setFormError(null);
  }

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    if (!title.trim()) return setFormError("Title is required.");
    if (!boardId || !schoolClassId || !subjectId || !chapterId) return setFormError("Select board, class, subject, and chapter.");
    if (!file) return setFormError("Choose a file to upload.");
    const fileCheck = validateUploadFile({ type: file.type, size: file.size });
    if (!fileCheck.ok) return setFormError(fileCheck.error);

    setUploading(true);
    const result = await createMaterial(
      { title, description: description || undefined, materialType, boardId, schoolClassId, subjectId, chapterId, topicId: topicId || undefined },
      file
    );
    setUploading(false);

    if (!result.ok) {
      setFormError(result.error ?? "Upload failed.");
      return;
    }
    showToast(`Uploaded "${title}"`, "The material is now visible to students once published.");
    resetForm();
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

          {formError && <p className="text-sm text-red-600 dark:text-red-400">{formError}</p>}

          <Button type="submit" disabled={uploading} className="w-full">
            {uploading ? "Uploading..." : "Upload material"}
          </Button>
        </form>

        <div className="mt-6 border-t border-gray-100 pt-4 dark:border-gray-800">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">Existing materials</p>
          {dbUnavailable ? (
            <div className="flex items-center gap-2.5 rounded-xl border border-gray-100 p-3 text-sm text-gray-500 dark:border-gray-800 dark:text-gray-400">
              <DatabaseZap className="h-4 w-4 shrink-0 text-gray-300 dark:text-gray-600" />
              Materials need a connected database to load. Set DATABASE_URL (see docs/DATABASE.md).
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
                        {m.subject.name} - {m.schoolClass.label} - {m.chapter.name} - {(m.sizeKb / 1024).toFixed(1)} MB - {formatDate(m.uploadedAt)}
                      </p>
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
