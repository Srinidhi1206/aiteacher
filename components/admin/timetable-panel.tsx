"use client";
// Timetables for the administrator: what has been imported and saved, who can see it, and the Import timetable button. A
// timetable is the weekly pattern of periods for a class - it is separate from the Academic Calendar (dated events). Backed by
// lib/actions/timetable.ts; the rules (a school administrator only ever sees and changes their own school's) are enforced there.
import * as React from "react";
import { Clock, FileUp, Eye, EyeOff, Trash2, Loader2, ExternalLink } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { DatabaseUnavailable } from "@/components/database-unavailable";
import { WeekGrid } from "@/components/timetable/week-grid";
import { TimetableImportDialog } from "@/components/admin/timetable-import-dialog";
import { getMyAdminStatus } from "@/lib/actions/user-management";
import { listTimetablesForAdmin, getTimetableForAdmin, setTimetablePublished, deleteTimetable } from "@/lib/actions/timetable";
import { formatDate } from "@/lib/utils";

type Row = Awaited<ReturnType<typeof listTimetablesForAdmin>>[number];
type Detail = NonNullable<Awaited<ReturnType<typeof getTimetableForAdmin>>>;

export function TimetablePanel() {
  const { showToast } = useToast();
  const [me, setMe] = React.useState<Awaited<ReturnType<typeof getMyAdminStatus>>>(null);
  const [rows, setRows] = React.useState<Row[] | null>(null);
  const [unavailable, setUnavailable] = React.useState(false);
  const [importOpen, setImportOpen] = React.useState(false);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = React.useState<string | null>(null);
  const [openId, setOpenId] = React.useState<string | null>(null);
  const [detail, setDetail] = React.useState<Detail | null>(null);

  const refresh = React.useCallback(() => {
    listTimetablesForAdmin()
      .then((r) => {
        setRows(r);
        setUnavailable(false);
      })
      .catch(() => setUnavailable(true));
  }, []);

  React.useEffect(() => {
    refresh();
    getMyAdminStatus().then(setMe).catch(() => setMe(null));
  }, [refresh]);

  const isSuperAdmin = me?.isSuperAdmin === true;
  const noSchool = me !== null && !isSuperAdmin && !me.schoolId;

  async function toggle(r: Row) {
    if (busyId) return;
    setBusyId(r.id);
    const res = await setTimetablePublished(r.id, !r.isPublished);
    setBusyId(null);
    if (!res.ok) return showToast("Could not update", res.error ?? "");
    showToast(r.isPublished ? "Timetable unpublished" : "Timetable published", r.isPublished ? "Students no longer see it." : "Students of that class can see it now.");
    refresh();
    if (openId === r.id) setOpenId(null);
  }

  async function remove(r: Row) {
    if (busyId) return;
    setBusyId(r.id);
    const res = await deleteTimetable(r.id);
    setBusyId(null);
    setConfirmDeleteId(null);
    if (!res.ok) return showToast("Could not delete", res.error ?? "");
    showToast("Timetable deleted", `${r.className}${r.section ? ` ${r.section}` : ""}`);
    if (openId === r.id) setOpenId(null);
    refresh();
  }

  async function view(r: Row) {
    if (openId === r.id) {
      setOpenId(null);
      return;
    }
    setOpenId(r.id);
    setDetail(null);
    const d = await getTimetableForAdmin(r.id).catch(() => null);
    setDetail(d);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-primary-500" /> Timetables
        </CardTitle>
        <CardDescription className="hidden sm:block">
          The weekly timetable of each class. Import one from a PDF or an image, review it, and publish it - students then see their own class&apos;s timetable. This is separate from the Academic Calendar.
        </CardDescription>
        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setImportOpen(true)} disabled={!me || noSchool}>
          <FileUp className="h-3.5 w-3.5" /> Import timetable
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {noSchool && <p className="text-sm text-gray-500 dark:text-gray-400">Your account is not attached to a school, so there are no timetables for you to manage.</p>}
        {unavailable ? (
          <DatabaseUnavailable what="Timetables" />
        ) : rows === null ? (
          <p className="py-8 text-center text-sm text-gray-400">Loading...</p>
        ) : rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-gray-400">No timetables yet. Use &ldquo;Import timetable&rdquo; to add the first one.</p>
        ) : (
          <ul className="space-y-2">
            {rows.map((r) => (
              <li key={r.id} className="rounded-xl border border-gray-100 p-3 dark:border-gray-800">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-800 dark:text-gray-100">
                      {r.className}
                      {r.section ? ` - Section ${r.section}` : ""}
                      {r.title ? <span className="ml-2 font-normal text-gray-500">{r.title}</span> : null}
                    </p>
                    <p className="text-xs text-gray-400">
                      {isSuperAdmin ? `${r.schoolName} - ` : ""}
                      {r.boardName} - {r.periods} period{r.periods === 1 ? "" : "s"}
                      {r.academicYear ? ` - ${r.academicYear}` : ""} - updated {formatDate(r.updatedAt.toString())}
                      {r.sourceUrl && (
                        <>
                          {" - "}
                          <a href={r.sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 text-primary-600 hover:underline dark:text-primary-300">
                            original <ExternalLink className="h-3 w-3" />
                          </a>
                        </>
                      )}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge variant={r.isPublished ? "success" : "warning"}>{r.isPublished ? "Published" : "Draft"}</Badge>
                    <Button size="sm" variant="outline" onClick={() => view(r)} disabled={busyId !== null}>
                      {openId === r.id ? "Hide" : "View"}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => toggle(r)} disabled={busyId !== null}>
                      {busyId === r.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : r.isPublished ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />} {r.isPublished ? "Unpublish" : "Publish"}
                    </Button>
                    {confirmDeleteId === r.id ? (
                      <>
                        <Button size="sm" variant="danger" onClick={() => remove(r)} disabled={busyId !== null}>
                          Confirm delete
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setConfirmDeleteId(null)} disabled={busyId !== null}>
                          Cancel
                        </Button>
                      </>
                    ) : (
                      <Button size="sm" variant="danger" onClick={() => setConfirmDeleteId(r.id)} disabled={busyId !== null} aria-label={`Delete the ${r.className} timetable`}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
                {openId === r.id && <div className="mt-3">{detail && detail.id === r.id ? <WeekGrid entries={detail.entries} /> : <p className="py-4 text-center text-sm text-gray-400">Loading...</p>}</div>}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
      {me && <TimetableImportDialog open={importOpen} onClose={() => setImportOpen(false)} admin={{ isSuperAdmin, schoolId: me.schoolId ?? null, schoolName: me.schoolName ?? null, schoolBoardId: me.schoolBoardId ?? null }} onImported={refresh} />}
    </Card>
  );
}
