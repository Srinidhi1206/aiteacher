"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { FileText, Pencil, Trash2, CheckCircle2, AlertTriangle } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/toast";
import { formatDate } from "@/lib/utils";
import { setWorksheetPublished, deleteWorksheet, updateWorksheet, type listWorksheetsForTeacher } from "@/lib/actions/worksheets";

type Worksheet = Awaited<ReturnType<typeof listWorksheetsForTeacher>>[number];

const inputClasses =
  "w-full rounded-xl border border-gray-200 bg-transparent px-3 py-2 text-sm text-gray-800 outline-none focus:border-primary-400 dark:border-gray-700 dark:text-gray-100";

export function WorksheetsList({ worksheets }: { worksheets: Worksheet[] }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = React.useState<string | null>(null);

  async function handleTogglePublish(w: Worksheet) {
    const result = await setWorksheetPublished(w.id, !w.isPublished);
    if (!result.ok) {
      showToast("Could not update", result.error ?? "");
      return;
    }
    router.refresh();
  }

  async function handleDelete(w: Worksheet) {
    const result = await deleteWorksheet(w.id);
    setConfirmDeleteId(null);
    if (!result.ok) {
      showToast("Could not delete", result.error ?? "");
      return;
    }
    showToast(`Deleted "${w.title}"`);
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-primary-500" /> Your Worksheets
        </CardTitle>
        <CardDescription>{worksheets.length} worksheet{worksheets.length === 1 ? "" : "s"}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {worksheets.length === 0 ? (
          <p className="py-6 text-center text-sm text-gray-400">No worksheets yet. Create one above.</p>
        ) : (
          worksheets.map((w) => {
            const submittedCount = w.submissions.length;
            return (
              <div key={w.id} className="rounded-xl border border-gray-100 dark:border-gray-800">
                <div className="flex items-center justify-between gap-3 p-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-gray-900 dark:text-gray-50">{w.title}</p>
                    <p className="truncate text-xs text-gray-400">
                      {w.subject.name} - {w.schoolClass.label}
                      {w.chapter ? ` - ${w.chapter.name}` : ""} - {submittedCount} submission{submittedCount === 1 ? "" : "s"}
                      {w.dueDate ? ` - due ${formatDate(w.dueDate)}` : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="hidden items-center gap-1 text-xs font-medium text-gray-500 dark:text-gray-400 sm:flex">
                      {w.isPublished ? <CheckCircle2 className="h-3.5 w-3.5 text-success-500" /> : <AlertTriangle className="h-3.5 w-3.5 text-warning-500" />}
                      {w.isPublished ? "Published" : "Draft"}
                    </span>
                    <Switch checked={w.isPublished} onCheckedChange={() => handleTogglePublish(w)} aria-label={`Publish "${w.title}"`} />
                    <button
                      onClick={() => setEditingId(editingId === w.id ? null : w.id)}
                      aria-label={`Edit "${w.title}"`}
                      className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-primary-600 dark:hover:bg-gray-800"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    {confirmDeleteId === w.id ? (
                      <div className="flex items-center gap-1">
                        <button onClick={() => handleDelete(w)} className="rounded-lg px-1.5 py-1 text-[11px] font-semibold text-red-600 hover:bg-red-50 dark:hover:bg-red-950">
                          Confirm
                        </button>
                        <button onClick={() => setConfirmDeleteId(null)} className="rounded-lg px-1.5 py-1 text-[11px] text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800">
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmDeleteId(w.id)}
                        aria-label={`Delete "${w.title}"`}
                        className="rounded-lg p-1.5 text-gray-300 hover:bg-gray-100 hover:text-red-500 dark:hover:bg-gray-800"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
                {editingId === w.id && <EditWorksheetForm worksheet={w} onDone={() => setEditingId(null)} />}
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}

function EditWorksheetForm({ worksheet, onDone }: { worksheet: Worksheet; onDone: () => void }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [title, setTitle] = React.useState(worksheet.title);
  const [instructions, setInstructions] = React.useState(worksheet.description ?? "");
  const [saving, setSaving] = React.useState(false);

  async function handleSave() {
    setSaving(true);
    const result = await updateWorksheet(worksheet.id, { title, instructions: instructions || undefined });
    setSaving(false);
    if (result.ok) {
      showToast("Worksheet updated");
      onDone();
      router.refresh();
    } else {
      showToast("Could not update", result.error ?? "");
    }
  }

  return (
    <div className="space-y-2 border-t border-gray-100 p-3 dark:border-gray-800">
      <input value={title} onChange={(e) => setTitle(e.target.value)} disabled={saving} className={inputClasses} />
      <textarea value={instructions} onChange={(e) => setInstructions(e.target.value)} rows={2} disabled={saving} className={inputClasses} />
      <div className="flex gap-2">
        <Button size="sm" onClick={handleSave} disabled={saving || !title.trim()}>
          {saving ? "Saving..." : "Save"}
        </Button>
        <Button size="sm" variant="ghost" onClick={onDone} disabled={saving}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
