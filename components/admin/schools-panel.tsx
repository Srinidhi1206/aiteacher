"use client";
// Schools management (super administrator only): every school with its state, board and headcounts, plus
// create / edit / enable-disable. Backed by lib/actions/school-admin.ts, which enforces who may do what - this
// screen only reflects it. Disabling is soft (hides the school from registration and the pickers); nothing is deleted.
import * as React from "react";
import { School as SchoolIcon, Plus, Pencil, Power, Loader2, ShieldAlert } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { inputClass, labelClass } from "@/components/register/field-styles";
import { listStates, listBoards } from "@/lib/actions/curriculum";
import { listSchoolsForAdmin, createSchool, updateSchool, setSchoolEnabled } from "@/lib/actions/school-admin";

type SchoolRow = Awaited<ReturnType<typeof listSchoolsForAdmin>>[number];
type State = Awaited<ReturnType<typeof listStates>>[number];
type Board = Awaited<ReturnType<typeof listBoards>>[number];

export function SchoolsPanel() {
  const { showToast } = useToast();
  const [schools, setSchools] = React.useState<SchoolRow[] | null>(null);
  const [error, setError] = React.useState<"forbidden" | "unavailable" | null>(null);
  const [states, setStates] = React.useState<State[]>([]);
  const [form, setForm] = React.useState<{ id: string | null; name: string; stateId: string; boardId: string } | null>(null);
  const [boards, setBoards] = React.useState<Board[]>([]);
  const [saving, setSaving] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);
  const [togglingId, setTogglingId] = React.useState<string | null>(null);

  const refresh = React.useCallback(() => {
    listSchoolsForAdmin()
      .then((rows) => {
        setSchools(rows);
        setError(null);
      })
      .catch((e) => setError(e instanceof Error && e.name === "ForbiddenError" ? "forbidden" : "unavailable"));
  }, []);

  React.useEffect(() => {
    refresh();
    listStates().then(setStates).catch(() => {});
  }, [refresh]);

  const formStateId = form?.stateId ?? "";
  React.useEffect(() => {
    setBoards([]);
    if (!formStateId) return;
    listBoards(formStateId).then(setBoards).catch(() => setBoards([]));
  }, [formStateId]);

  async function save() {
    if (!form) return;
    setSaving(true);
    setFormError(null);
    const input = { name: form.name, stateId: form.stateId || undefined, boardId: form.boardId || undefined };
    const res = form.id ? await updateSchool(form.id, input) : await createSchool(input);
    setSaving(false);
    if (!res.ok) {
      setFormError(res.error ?? "Could not save the school.");
      return;
    }
    showToast(form.id ? "School updated" : "School created", form.name);
    setForm(null);
    refresh();
  }

  async function toggle(school: SchoolRow) {
    setTogglingId(school.id);
    const res = await setSchoolEnabled(school.id, !school.isEnabled);
    setTogglingId(null);
    if (!res.ok) {
      showToast("Could not update school", res.error ?? "");
      return;
    }
    showToast(school.isEnabled ? "School disabled" : "School enabled", school.name);
    refresh();
  }

  if (error === "forbidden") {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
          <ShieldAlert className="h-8 w-8 text-gray-300 dark:text-gray-600" />
          <p className="text-sm text-gray-500 dark:text-gray-400">Only the super administrator can manage schools.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <SchoolIcon className="h-4 w-4 text-primary-500" /> Schools
        </CardTitle>
        <CardDescription className="hidden sm:block">
          Every school on the platform. Disabling a school hides it from registration and the school pickers; its existing students, staff and materials keep
          working and nothing is deleted.
        </CardDescription>
        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setForm({ id: null, name: "", stateId: "", boardId: "" })}>
          <Plus className="h-3.5 w-3.5" /> Add school
        </Button>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        {error === "unavailable" ? (
          <p className="py-8 text-center text-sm text-gray-400">Schools could not be loaded right now.</p>
        ) : schools === null ? (
          <p className="py-8 text-center text-sm text-gray-400">Loading...</p>
        ) : schools.length === 0 ? (
          <p className="py-8 text-center text-sm text-gray-400">No schools yet.</p>
        ) : (
          <table className="w-full min-w-[760px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-xs uppercase tracking-wide text-gray-400 dark:border-gray-800">
                <th className="py-2 pr-3 font-medium">School</th>
                <th className="py-2 pr-3 font-medium">State</th>
                <th className="py-2 pr-3 font-medium">Board</th>
                <th className="py-2 pr-3 text-right font-medium">Students</th>
                <th className="py-2 pr-3 text-right font-medium">Teachers</th>
                <th className="py-2 pr-3 text-right font-medium">Admins</th>
                <th className="py-2 pr-3 text-right font-medium">Materials</th>
                <th className="py-2 pr-3 font-medium">Status</th>
                <th className="py-2 pr-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {schools.map((s) => (
                <tr key={s.id} className="border-b border-gray-50 last:border-0 dark:border-gray-800/60">
                  <td className="py-2.5 pr-3 font-medium text-gray-800 dark:text-gray-100">{s.name}</td>
                  <td className="py-2.5 pr-3 text-gray-500 dark:text-gray-400">{s.state?.name ?? "-"}</td>
                  <td className="py-2.5 pr-3 text-gray-500 dark:text-gray-400">{s.board?.shortName ?? "-"}</td>
                  <td className="py-2.5 pr-3 text-right tabular-nums">{s._count.students}</td>
                  <td className="py-2.5 pr-3 text-right tabular-nums">{s._count.teachers}</td>
                  <td className="py-2.5 pr-3 text-right tabular-nums">{s._count.admins}</td>
                  <td className="py-2.5 pr-3 text-right tabular-nums">{s._count.studyMaterials}</td>
                  <td className="py-2.5 pr-3">
                    <Badge variant={s.isEnabled ? "success" : "warning"}>{s.isEnabled ? "Enabled" : "Disabled"}</Badge>
                  </td>
                  <td className="py-2.5 pr-3">
                    <div className="flex flex-wrap gap-1.5">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setForm({ id: s.id, name: s.name, stateId: s.stateId ?? "", boardId: s.boardId ?? "" })}
                      >
                        <Pencil className="h-3.5 w-3.5" /> Edit
                      </Button>
                      <Button size="sm" variant="outline" disabled={togglingId === s.id} onClick={() => toggle(s)}>
                        {togglingId === s.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Power className="h-3.5 w-3.5" />}{" "}
                        {s.isEnabled ? "Disable" : "Enable"}
                      </Button>
                    </div>
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
        title={form?.id ? "Edit school" : "Add school"}
        description="State and board are optional. A school with a board only accepts students and materials of that board."
      >
        {form && (
          <div className="space-y-3">
            <div>
              <label className={labelClass}>School name</label>
              <input className={inputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} disabled={saving} />
            </div>
            <div>
              <label className={labelClass}>State (optional)</label>
              <select
                className={inputClass}
                value={form.stateId}
                onChange={(e) => setForm({ ...form, stateId: e.target.value, boardId: "" })}
                disabled={saving}
              >
                <option value="">No state</option>
                {states.map((st) => (
                  <option key={st.id} value={st.id}>
                    {st.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>Board (optional)</label>
              <select className={inputClass} value={form.boardId} onChange={(e) => setForm({ ...form, boardId: e.target.value })} disabled={saving || !form.stateId}>
                <option value="">{form.stateId ? "No board" : "Choose a state first"}</option>
                {boards.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.shortName}
                  </option>
                ))}
              </select>
            </div>
            {formError && <p className="text-sm text-red-600 dark:text-red-400">{formError}</p>}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setForm(null)} disabled={saving}>
                Cancel
              </Button>
              <Button onClick={save} disabled={saving || form.name.trim().length < 2}>
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} {form.id ? "Save changes" : "Create school"}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </Card>
  );
}
