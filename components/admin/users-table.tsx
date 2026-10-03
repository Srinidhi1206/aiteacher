"use client";
// Stage F: real admin user-management + registration approval. Fetches via
// the server actions in lib/actions/user-management.ts (client-side, since
// this component lives inside AdminTabs' client boundary - see that file
// for why an async Server Component can't be used here instead). Every
// approve/reject/suspend/reactivate button is a convenience only: the
// actual authorization (e.g. "only a super admin may approve an admin") is
// enforced server-side on every call, regardless of what this UI shows.
import * as React from "react";
import { Check, X, Ban, RotateCcw, ShieldAlert, Loader2, UserPlus, Copy, CheckCheck, KeyRound, BookUser, School as SchoolIcon } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { DatabaseUnavailable } from "@/components/database-unavailable";
import { useToast } from "@/components/ui/toast";
import { formatDate } from "@/lib/utils";
import { inputClass, labelClass } from "@/components/register/field-styles";
import {
  listUsersForAdmin,
  approveRegistration,
  rejectRegistration,
  suspendUser,
  reactivateUser,
  getMyAdminStatus,
  createStudent,
  resetUserPassword,
  assignStudentSchool,
} from "@/lib/actions/user-management";
import { listAllBoardsWithClasses, listSchools, listSchoolClasses, listSubjectsForClass } from "@/lib/actions/curriculum";
import {
  listTeacherAssignments,
  assignTeacherToClassSubject,
  removeTeacherAssignment,
  type TeacherAssignmentRow,
} from "@/lib/actions/teacher-management";

type BoardWithClasses = Awaited<ReturnType<typeof listAllBoardsWithClasses>>[number];
type SchoolOption = Awaited<ReturnType<typeof listSchools>>[number];

type AdminUserRow = Awaited<ReturnType<typeof listUsersForAdmin>>[number];

const statusFilters = ["ALL", "PENDING", "ACTIVE", "REJECTED", "SUSPENDED"] as const;
type StatusFilter = (typeof statusFilters)[number];

const roleFilters = ["ALL", "STUDENT", "TEACHER", "ADMIN"] as const;
type RoleFilterValue = (typeof roleFilters)[number];

const statusVariant: Record<string, "success" | "danger" | "warning" | "default"> = {
  ACTIVE: "success",
  SUSPENDED: "danger",
  REJECTED: "danger",
  PENDING: "warning",
};

// What a reviewer needs to see before approving an admin request: which school
// it is for, and - the security-relevant part - whether the applicant is asking
// to join a school that already exists rather than register a new one.
function AdminRequestDetails({ details }: { details: unknown }) {
  const d = (details ?? {}) as { schoolName?: string; joinSchoolId?: string; reason?: string };
  if (!d.schoolName) return null;
  return (
    <span className="mt-0.5 block text-xs font-normal text-gray-500 dark:text-gray-400">
      {d.joinSchoolId ? (
        <span className="font-medium text-warning-700 dark:text-warning-400">Wants to join existing school: {d.schoolName}</span>
      ) : (
        <>New school: {d.schoolName}</>
      )}
      {d.reason ? <span className="block max-w-xs truncate" title={d.reason}>&ldquo;{d.reason}&rdquo;</span> : null}
    </span>
  );
}

// A teacher's requested class/subject pairs are applied automatically when the request is approved.
function TeacherRequestDetails({ details }: { details: unknown }) {
  const d = (details ?? {}) as { requestedAssignments?: unknown[] };
  const count = Array.isArray(d.requestedAssignments) ? d.requestedAssignments.length : 0;
  if (count === 0) return null;
  return (
    <span className="mt-0.5 block text-xs font-normal text-gray-500 dark:text-gray-400">
      Teaches {count} class/subject combination{count === 1 ? "" : "s"} - applied when you approve (you can change them afterwards).
    </span>
  );
}

export function UsersTable() {
  const [users, setUsers] = React.useState<AdminUserRow[] | null>(null);
  const [dbUnavailable, setDbUnavailable] = React.useState(false);
  const [unauthorized, setUnauthorized] = React.useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = React.useState(false);
  const [myAdmin, setMyAdmin] = React.useState<Awaited<ReturnType<typeof getMyAdminStatus>>>(null);
  const [statusFilter, setStatusFilter] = React.useState<StatusFilter>("PENDING");
  const [roleFilter, setRoleFilter] = React.useState<RoleFilterValue>("ALL");
  const [search, setSearch] = React.useState("");
  const [schoolFilter, setSchoolFilter] = React.useState("ALL");
  const [boardFilter, setBoardFilter] = React.useState("ALL");
  const [classFilter, setClassFilter] = React.useState("ALL");
  const [actingUserId, setActingUserId] = React.useState<string | null>(null);
  const [rejectTarget, setRejectTarget] = React.useState<AdminUserRow | null>(null);
  const [rejectReason, setRejectReason] = React.useState("");
  const [showCreateStudent, setShowCreateStudent] = React.useState(false);
  const [resetTarget, setResetTarget] = React.useState<AdminUserRow | null>(null);
  const [assignTarget, setAssignTarget] = React.useState<AdminUserRow | null>(null);
  const [schoolTarget, setSchoolTarget] = React.useState<AdminUserRow | null>(null);
  const { showToast } = useToast();

  const refresh = React.useCallback(async () => {
    try {
      const [rows, status] = await Promise.all([listUsersForAdmin(), getMyAdminStatus()]);
      setUsers(rows);
      setIsSuperAdmin(status?.isSuperAdmin ?? false);
      setMyAdmin(status);
      setDbUnavailable(false);
      setUnauthorized(false);
    } catch (err) {
      if (err instanceof Error && (err.name === "UnauthorizedError" || err.name === "ForbiddenError")) {
        setUnauthorized(true);
      } else {
        setDbUnavailable(true);
      }
    }
  }, []);

  React.useEffect(() => {
    refresh();
  }, [refresh]);

  async function handleApprove(user: AdminUserRow) {
    if (!user.registrationRequest) return;
    setActingUserId(user.id);
    const result = await approveRegistration(user.registrationRequest.id);
    setActingUserId(null);
    if (result.ok) {
      showToast("Registration approved", `${user.name} can now sign in.`);
      refresh();
    } else {
      showToast("Could not approve", result.error);
    }
  }

  async function submitReject() {
    if (!rejectTarget?.registrationRequest) return;
    setActingUserId(rejectTarget.id);
    const result = await rejectRegistration(rejectTarget.registrationRequest.id, rejectReason);
    setActingUserId(null);
    if (result.ok) {
      showToast("Registration rejected", `${rejectTarget.name}'s request was rejected.`);
      setRejectTarget(null);
      setRejectReason("");
      refresh();
    } else {
      showToast("Could not reject", result.error);
    }
  }

  async function handleSuspend(user: AdminUserRow) {
    setActingUserId(user.id);
    const result = await suspendUser(user.id);
    setActingUserId(null);
    if (result.ok) {
      showToast("User suspended", `${user.name} can no longer sign in.`);
      refresh();
    } else {
      showToast("Could not suspend", result.error);
    }
  }

  async function handleReactivate(user: AdminUserRow) {
    setActingUserId(user.id);
    const result = await reactivateUser(user.id);
    setActingUserId(null);
    if (result.ok) {
      showToast("User reactivated", `${user.name} can sign in again.`);
      refresh();
    } else {
      showToast("Could not reactivate", result.error);
    }
  }

  if (dbUnavailable) return <DatabaseUnavailable what="User management" />;

  if (unauthorized) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
          <ShieldAlert className="h-8 w-8 text-gray-300 dark:text-gray-600" />
          <p className="text-sm text-gray-500 dark:text-gray-400">You don&apos;t have permission to view this.</p>
        </CardContent>
      </Card>
    );
  }

  // The school, board and class of a user live on whichever profile they have (student / teacher / admin).
  const schoolOf = (u: AdminUserRow) => u.student?.school ?? u.teacher?.school ?? null;
  const schoolOptions = Array.from(new Map((users ?? []).flatMap((u) => { const s = schoolOf(u); return s ? [[s.id, s.name] as const] : []; })).entries()).sort((a, b) => a[1].localeCompare(b[1]));
  const boardOptions = Array.from(new Map((users ?? []).flatMap((u) => (u.student?.board ? [[u.student.board.id, u.student.board.shortName] as const] : []))).entries()).sort((a, b) => a[1].localeCompare(b[1]));
  const classOptions = Array.from(new Set((users ?? []).flatMap((u) => (u.student?.schoolClass ? [u.student.schoolClass.label] : [])))).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const needle = search.trim().toLowerCase();

  const visible = (users ?? []).filter((u) => {
    if (statusFilter !== "ALL" && u.status !== statusFilter) return false;
    if (roleFilter !== "ALL" && u.role !== roleFilter) return false;
    if (schoolFilter !== "ALL" && (schoolFilter === "NONE" ? schoolOf(u) !== null || u.role === "ADMIN" : schoolOf(u)?.id !== schoolFilter)) return false;
    if (boardFilter !== "ALL" && u.student?.board?.id !== boardFilter) return false;
    if (classFilter !== "ALL" && u.student?.schoolClass?.label !== classFilter) return false;
    if (needle && ![u.name, u.email, u.username].some((v) => v?.toLowerCase().includes(needle))) return false;
    return true;
  });
  const filtersActive = needle !== "" || schoolFilter !== "ALL" || boardFilter !== "ALL" || classFilter !== "ALL" || roleFilter !== "ALL" || statusFilter !== "ALL";

  return (
    <Card>
      <CardHeader>
        <CardTitle>Users &amp; Registration Requests</CardTitle>
        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setShowCreateStudent(true)}>
          <UserPlus className="h-3.5 w-3.5" /> Create Student
        </Button>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex flex-wrap gap-1.5">
            {statusFilters.map((f) => (
              <button
                key={f}
                onClick={() => setStatusFilter(f)}
                className={`rounded-full px-2.5 py-1 text-xs font-medium capitalize transition-colors ${
                  statusFilter === f
                    ? "bg-primary-600 text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300"
                }`}
              >
                {f.toLowerCase()}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {roleFilters.map((f) => (
              <button
                key={f}
                onClick={() => setRoleFilter(f)}
                className={`rounded-full px-2.5 py-1 text-xs font-medium capitalize transition-colors ${
                  roleFilter === f
                    ? "bg-gray-800 text-white dark:bg-gray-200 dark:text-gray-900"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300"
                }`}
              >
                {f.toLowerCase()}
              </button>
            ))}
          </div>
        </div>
        <div className="grid w-full grid-cols-2 gap-2 sm:grid-cols-4">
          <input
            type="search"
            aria-label="Search users"
            placeholder="Search name, email or username"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={`${inputClass} col-span-2 !py-1.5 !text-xs sm:col-span-1`}
          />
          <select aria-label="Filter by school" className={`${inputClass} !py-1.5 !text-xs`} value={schoolFilter} onChange={(e) => setSchoolFilter(e.target.value)}>
            <option value="ALL">All schools</option>
            <option value="NONE">No school assigned</option>
            {schoolOptions.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
          <select aria-label="Filter by board" className={`${inputClass} !py-1.5 !text-xs`} value={boardFilter} onChange={(e) => setBoardFilter(e.target.value)}>
            <option value="ALL">All boards</option>
            {boardOptions.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
          <select aria-label="Filter by class" className={`${inputClass} !py-1.5 !text-xs`} value={classFilter} onChange={(e) => setClassFilter(e.target.value)}>
            <option value="ALL">All classes</option>
            {classOptions.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        {users !== null && (
          <p className="text-xs text-gray-400">
            Showing {visible.length} of {users.length} user{users.length === 1 ? "" : "s"}
            {filtersActive && (
              <button
                type="button"
                className="ml-2 font-medium text-primary-600 hover:underline dark:text-primary-300"
                onClick={() => {
                  setSearch("");
                  setSchoolFilter("ALL");
                  setBoardFilter("ALL");
                  setClassFilter("ALL");
                  setRoleFilter("ALL");
                  setStatusFilter("ALL");
                }}
              >
                Clear filters
              </button>
            )}
          </p>
        )}
      </CardHeader>
      <CardContent className="overflow-x-auto">
        {users === null ? (
          <p className="py-8 text-center text-sm text-gray-400">Loading...</p>
        ) : visible.length === 0 ? (
          <p className="py-8 text-center text-sm text-gray-400">
            {statusFilter === "PENDING" && roleFilter === "ALL"
              ? 'No registrations are waiting for approval. Choose "all" above to see every user.'
              : "No users match this filter."}
          </p>
        ) : (
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-xs uppercase tracking-wide text-gray-400 dark:border-gray-800">
                <th className="py-2 pr-3 font-medium">Name</th>
                <th className="py-2 pr-3 font-medium">Email</th>
                <th className="py-2 pr-3 font-medium">Role</th>
                <th className="py-2 pr-3 font-medium">Status</th>
                <th className="py-2 pr-3 font-medium">Joined</th>
                <th className="py-2 pr-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((u) => {
                const acting = actingUserId === u.id;
                const isProtectedSuperAdmin = u.admin?.isSuperAdmin === true;
                const needsSuperAdmin = u.role === "ADMIN" && !isSuperAdmin;
                return (
                  <tr key={u.id} className="border-b border-gray-50 last:border-0 dark:border-gray-800/60">
                    <td className="py-2.5 pr-3 font-medium text-gray-800 dark:text-gray-100">
                      {u.name}
                      {isProtectedSuperAdmin && <Badge variant="primary" className="ml-1.5">Super Admin</Badge>}
                      {u.status === "PENDING" && u.role === "ADMIN" && <AdminRequestDetails details={u.registrationRequest?.requestedDetails} />}
                      {u.status === "PENDING" && u.role === "TEACHER" && <TeacherRequestDetails details={u.registrationRequest?.requestedDetails} />}
                      {u.role === "STUDENT" && u.student && (
                        <span className="mt-0.5 block text-xs font-normal text-gray-400">
                          {[u.student.state?.name, u.student.board?.shortName, u.student.schoolClass?.label].filter(Boolean).join(" · ") || "No curriculum selected"}
                          {" · "}
                          <span className={u.student.school ? undefined : "text-warning-600 dark:text-warning-400"}>{u.student.school?.name ?? "No school assigned"}</span>
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 pr-3 text-gray-500 dark:text-gray-400">{u.email}</td>
                    <td className="py-2.5 pr-3">
                      <Badge variant="outline" className="capitalize">{u.role.toLowerCase()}</Badge>
                    </td>
                    <td className="py-2.5 pr-3">
                      <Badge variant={statusVariant[u.status] ?? "default"} className="capitalize">
                        {u.status.toLowerCase()}
                      </Badge>
                    </td>
                    <td className="py-2.5 pr-3 text-gray-500 dark:text-gray-400">{formatDate(u.createdAt.toString())}</td>
                    <td className="py-2.5 pr-3">
                      <div className="flex flex-wrap gap-1.5">
                        {u.status === "PENDING" && u.registrationRequest && (
                          <>
                            <Button
                              size="sm"
                              variant="success"
                              disabled={acting || needsSuperAdmin}
                              onClick={() => handleApprove(u)}
                              title={needsSuperAdmin ? "Only the super admin can approve an admin request." : undefined}
                            >
                              {acting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={acting || needsSuperAdmin}
                              onClick={() => setRejectTarget(u)}
                            >
                              <X className="h-3.5 w-3.5" /> Reject
                            </Button>
                          </>
                        )}
                        {u.status === "ACTIVE" && u.role === "TEACHER" && (
                          <Button size="sm" variant="outline" disabled={acting} onClick={() => setAssignTarget(u)}>
                            <BookUser className="h-3.5 w-3.5" /> Assignments
                          </Button>
                        )}
                        {isSuperAdmin && u.status === "ACTIVE" && u.role === "STUDENT" && (
                          <Button size="sm" variant="outline" disabled={acting} onClick={() => setSchoolTarget(u)}>
                            <SchoolIcon className="h-3.5 w-3.5" /> {u.student?.school ? "Change school" : "Set school"}
                          </Button>
                        )}
                        {u.status === "ACTIVE" && (u.role === "STUDENT" || u.role === "TEACHER") && (
                          <Button size="sm" variant="outline" disabled={acting} onClick={() => setResetTarget(u)}>
                            <KeyRound className="h-3.5 w-3.5" /> Reset password
                          </Button>
                        )}
                        {u.status === "ACTIVE" && !isProtectedSuperAdmin && (
                          <Button
                            size="sm"
                            variant="danger"
                            disabled={acting || needsSuperAdmin}
                            onClick={() => handleSuspend(u)}
                            title={needsSuperAdmin ? "Only the super admin can suspend an admin." : undefined}
                          >
                            {acting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Ban className="h-3.5 w-3.5" />} Suspend
                          </Button>
                        )}
                        {u.status === "SUSPENDED" && (
                          <Button size="sm" variant="outline" disabled={acting || needsSuperAdmin} onClick={() => handleReactivate(u)}>
                            {acting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />} Reactivate
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </CardContent>

      <Modal
        open={!!rejectTarget}
        onClose={() => {
          setRejectTarget(null);
          setRejectReason("");
        }}
        title="Reject registration"
        description={rejectTarget ? `Explain why "${rejectTarget.name}"'s registration is being rejected.` : undefined}
      >
        <textarea
          value={rejectReason}
          onChange={(e) => setRejectReason(e.target.value)}
          rows={3}
          placeholder="Reason (shown internally, not to the applicant)"
          className="w-full rounded-xl border border-gray-200 bg-transparent p-3 text-sm outline-none focus:border-primary-400 dark:border-gray-700"
        />
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setRejectTarget(null)}>
            Cancel
          </Button>
          <Button variant="danger" disabled={!rejectReason.trim()} onClick={submitReject}>
            Reject registration
          </Button>
        </div>
      </Modal>

      <ResetPasswordModal target={resetTarget} onClose={() => setResetTarget(null)} />

      <AssignSchoolModal
        target={schoolTarget}
        onClose={() => setSchoolTarget(null)}
        onAssigned={refresh}
      />

      <TeacherAssignmentsModal target={assignTarget} onClose={() => setAssignTarget(null)} />

      <CreateStudentModal
        open={showCreateStudent}
        onClose={() => setShowCreateStudent(false)}
        onCreated={refresh}
        myAdmin={myAdmin}
      />
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Teacher assignments (lib/actions/teacher-management.ts): which class and
// subject a teacher teaches. Every exam, worksheet and analytics screen a
// teacher uses is gated on these. Classes offered are the teacher's school's
// board only, and subjects are the ones that class really offers - both read
// from the database; the server re-checks all of it on every call.
// ---------------------------------------------------------------------------
function TeacherAssignmentsModal({ target, onClose }: { target: AdminUserRow | null; onClose: () => void }) {
  const { showToast } = useToast();
  const [assignments, setAssignments] = React.useState<TeacherAssignmentRow[] | null>(null);
  const [classes, setClasses] = React.useState<Awaited<ReturnType<typeof listSchoolClasses>>>([]);
  const [subjects, setSubjects] = React.useState<Awaited<ReturnType<typeof listSubjectsForClass>>>([]);
  const [classId, setClassId] = React.useState("");
  const [subjectId, setSubjectId] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const teacherId = target?.id ?? null;

  const load = React.useCallback(async () => {
    if (!teacherId) return;
    setError(null);
    const res = await listTeacherAssignments(teacherId);
    if (!res.ok || !res.data) {
      setError(res.error || "Could not load assignments.");
      setAssignments([]);
      return;
    }
    // Classes are loaded BEFORE the list is shown, so "no board set" can never flash up
    // while the class list is still on its way.
    const offered = res.data.boardId ? await listSchoolClasses(res.data.boardId) : [];
    setClasses(offered);
    setAssignments(res.data.assignments);
  }, [teacherId]);

  React.useEffect(() => {
    setAssignments(null);
    setClassId("");
    setSubjectId("");
    setSubjects([]);
    load();
  }, [load]);

  React.useEffect(() => {
    setSubjectId("");
    if (!classId) {
      setSubjects([]);
      return;
    }
    listSubjectsForClass(classId).then(setSubjects);
  }, [classId]);

  async function add() {
    if (!teacherId || !classId || !subjectId) return;
    setBusy(true);
    setError(null);
    const res = await assignTeacherToClassSubject(teacherId, classId, subjectId);
    setBusy(false);
    if (!res.ok) {
      setError(res.error || "Could not assign.");
      return;
    }
    showToast("Assignment added", `${target?.name} can now create exams and worksheets for it.`);
    setSubjectId("");
    load();
  }

  async function remove(id: string) {
    setBusy(true);
    const res = await removeTeacherAssignment(id);
    setBusy(false);
    if (!res.ok) {
      setError(res.error || "Could not remove.");
      return;
    }
    showToast("Assignment removed", `${target?.name} can no longer create new exams for it.`);
    load();
  }

  return (
    <Modal
      open={!!target}
      onClose={onClose}
      title="Class & subject assignments"
      description={target ? `What "${target.name}" teaches. A teacher can only create exams and worksheets for these.` : undefined}
    >
      <div className="space-y-4">
        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

        <div>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-400">Current</p>
          {assignments === null ? (
            <p className="text-sm text-gray-400">Loading...</p>
          ) : assignments.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">No assignments yet, so this teacher can&apos;t create exams or worksheets.</p>
          ) : (
            <ul className="space-y-1.5">
              {assignments.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-2 rounded-lg border border-gray-100 px-3 py-2 text-sm dark:border-gray-800">
                  <span className="text-gray-700 dark:text-gray-200">
                    {a.classLabel} - {a.subjectName}
                  </span>
                  <Button size="sm" variant="ghost" disabled={busy} onClick={() => remove(a.id)} aria-label={`Remove ${a.classLabel} - ${a.subjectName}`}>
                    <X className="h-3.5 w-3.5" /> Remove
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="space-y-2 border-t border-gray-100 pt-3 dark:border-gray-800">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Add</p>
          {assignments !== null && classes.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">This teacher&apos;s school has no board set, so there are no classes to offer.</p>
          ) : (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div>
                <label className={labelClass}>Class</label>
                <select className={`${inputClass} !py-2 !text-xs`} value={classId} onChange={(e) => setClassId(e.target.value)} disabled={busy}>
                  <option value="">Select</option>
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>{c.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelClass}>Subject</label>
                <select className={`${inputClass} !py-2 !text-xs`} value={subjectId} onChange={(e) => setSubjectId(e.target.value)} disabled={busy || !classId}>
                  <option value="">Select</option>
                  {subjects.map((sb) => (
                    <option key={sb.id} value={sb.id}>{sb.name}</option>
                  ))}
                </select>
              </div>
            </div>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={onClose}>
              Done
            </Button>
            <Button disabled={busy || !classId || !subjectId} onClick={add}>
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <BookUser className="h-3.5 w-3.5" />} Assign
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Set / change a student's school (assignStudentSchool in
// lib/actions/user-management.ts, super admin only). Only existing, enabled
// schools are offered; this never creates a school.
// ---------------------------------------------------------------------------
function AssignSchoolModal({
  target,
  onClose,
  onAssigned,
}: {
  target: AdminUserRow | null;
  onClose: () => void;
  onAssigned: () => void;
}) {
  const { showToast } = useToast();
  const [schools, setSchools] = React.useState<SchoolOption[] | null>(null);
  const [schoolId, setSchoolId] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!target) return;
    setSchoolId("");
    setError(null);
    setSchools(null);
    listSchools()
      .then((rows) => setSchools(rows))
      .catch(() => setSchools([]));
  }, [target]);

  async function submit() {
    if (!target || !schoolId) return;
    setSubmitting(true);
    setError(null);
    const res = await assignStudentSchool(target.id, schoolId);
    setSubmitting(false);
    if (!res.ok) {
      setError(res.error || "Could not set the school.");
      return;
    }
    showToast("School updated", `${target.name} now belongs to the selected school.`);
    onAssigned();
    onClose();
  }

  const current = target?.student?.school?.name ?? null;

  return (
    <Modal
      open={!!target}
      onClose={onClose}
      title="Set student's school"
      description={target ? `Choose an existing school for "${target.name}". Current school: ${current ?? "none"}.` : undefined}
    >
      <div className="space-y-4">
        <div>
          <label className={labelClass}>School</label>
          <select className={inputClass} value={schoolId} onChange={(e) => setSchoolId(e.target.value)} disabled={submitting || schools === null}>
            <option value="">{schools === null ? "Loading..." : "Select a school"}</option>
            {(schools ?? []).map((s) => (
              <option key={s.id} value={s.id} disabled={s.id === target?.student?.schoolId}>
                {s.name}
              </option>
            ))}
          </select>
          <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
            The student&apos;s state, board and class are not changed. They will see only the materials, exams and schedules of the school you choose.
          </p>
        </div>
        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={submitting || !schoolId}>
            {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <SchoolIcon className="h-3.5 w-3.5" />} Save school
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Reset password (resetUserPassword in lib/actions/user-management.ts). Two
// steps: confirm, then the new password is shown exactly once from that
// action's response only - it lives in this component's local state and is
// gone when the dialog closes or the page refreshes; only the bcrypt hash is
// ever stored, so there is nothing to look up again.
// ---------------------------------------------------------------------------
function ResetPasswordModal({ target, onClose }: { target: AdminUserRow | null; onClose: () => void }) {
  const { showToast } = useToast();
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<{ username: string; password: string } | null>(null);
  const [copied, setCopied] = React.useState(false);

  function close() {
    setResult(null);
    setError(null);
    setCopied(false);
    onClose();
  }

  async function confirmReset() {
    if (!target) return;
    setSubmitting(true);
    setError(null);
    const res = await resetUserPassword(target.id);
    setSubmitting(false);
    if (!res.ok || !res.data) {
      setError(res.error || "Could not reset the password.");
      return;
    }
    setResult({ username: res.data.username, password: res.data.newPassword });
    showToast("Password reset", `${target.name}'s old password no longer works.`);
  }

  async function copy() {
    if (!result) return;
    await navigator.clipboard.writeText(`Student ID: ${result.username}\nPassword: ${result.password}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Modal
      open={!!target}
      onClose={close}
      title={result ? "New password issued" : "Reset password"}
      description={!result && target ? `Issue a new password for "${target.name}". Their current password will stop working.` : undefined}
    >
      {result ? (
        <div className="space-y-4">
          <div className="rounded-xl border border-warning-200 bg-warning-50 p-4 text-sm dark:border-warning-900/40 dark:bg-warning-900/20">
            <p className="mb-3 font-medium text-warning-800 dark:text-warning-300">
              Save this password now. It will not be shown again.
            </p>
            <div className="space-y-1.5 rounded-lg bg-white p-3 font-mono text-xs dark:bg-gray-950">
              <p className="text-gray-700 dark:text-gray-200">
                <span className="text-gray-400">Student ID:</span> {result.username}
              </p>
              <p className="text-gray-700 dark:text-gray-200">
                <span className="text-gray-400">Password:</span> {result.password}
              </p>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" className="gap-1.5" onClick={copy}>
              {copied ? <CheckCheck className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} {copied ? "Copied" : "Copy"}
            </Button>
            <Button onClick={close}>Done</Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={close} disabled={submitting}>
              Cancel
            </Button>
            <Button variant="danger" onClick={confirmReset} disabled={submitting}>
              {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <KeyRound className="h-3.5 w-3.5" />} Reset password
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Create Student - admin-initiated account creation (createStudent in
// lib/actions/user-management.ts). Board -> Class cascades from one real
// query (listAllBoardsWithClasses, already used by the Board & Classes
// admin screen) - no hard-coded board/class lists. On success, the
// initial password is shown exactly once, from this action's response
// only; it is never re-fetched from the database (it can't be - only the
// bcrypt hash is stored) and disappears the moment the modal is closed or
// the page is refreshed, since it only ever lives in this component's
// local state.
// ---------------------------------------------------------------------------

function CreateStudentModal({
  open,
  onClose,
  onCreated,
  myAdmin,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  myAdmin: Awaited<ReturnType<typeof getMyAdminStatus>>;
}) {
  const [boards, setBoards] = React.useState<BoardWithClasses[] | null>(null);
  const [schools, setSchools] = React.useState<SchoolOption[] | null>(null);
  const [name, setName] = React.useState("");
  const [username, setUsername] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [schoolId, setSchoolId] = React.useState("");
  const [boardId, setBoardId] = React.useState("");
  const [schoolClassId, setSchoolClassId] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [created, setCreated] = React.useState<{ username: string; password: string } | null>(null);
  const [copied, setCopied] = React.useState(false);
  const { showToast } = useToast();

  // A school-scoped admin (myAdmin.schoolId set) always creates students for
  // their own school - the School field is locked to it, and if that school
  // already has a board assigned, Board is locked too. This mirrors exactly
  // what createStudent enforces server-side (never trusting client input for
  // schoolId/boardId once an admin is school-scoped) - the UI reflects the
  // real constraint instead of offering choices the server would override.
  const lockedSchoolId = myAdmin?.schoolId ?? null;
  const lockedBoardId = myAdmin?.schoolBoardId ?? null;

  React.useEffect(() => {
    if (!open || boards !== null) return;
    Promise.all([listAllBoardsWithClasses(), listSchools()])
      .then(([b, s]) => {
        setBoards(b);
        setSchools(s);
        if (lockedSchoolId) setSchoolId(lockedSchoolId);
        if (lockedBoardId) setBoardId(lockedBoardId);
      })
      .catch(() => setError("Could not load boards/classes. Is the database connected?"));
  }, [open, boards, lockedSchoolId, lockedBoardId]);

  function resetForm() {
    setName("");
    setUsername("");
    setPassword("");
    setSchoolId(lockedSchoolId ?? "");
    setBoardId(lockedBoardId ?? "");
    setSchoolClassId("");
    setError(null);
    setCreated(null);
    setCopied(false);
  }

  function handleClose() {
    resetForm();
    onClose();
  }

  const selectedBoard = boards?.find((b) => b.id === boardId) ?? null;
  const availableClasses = (selectedBoard?.schoolClasses ?? []).filter((c) => c.isEnabled);
  const enabledBoards = (boards ?? []).filter((b) => b.isEnabled);
  const enabledSchools = (schools ?? []).filter((s) => s.isEnabled);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const result = await createStudent({
      name,
      username,
      password,
      boardId,
      schoolClassId,
      schoolId: schoolId || undefined,
    });
    setSubmitting(false);
    if (!result.ok || !result.data) {
      setError(result.error || "Could not create student.");
      return;
    }
    setCreated({ username: result.data.username, password: result.data.initialPassword });
    showToast("Student created", `${name} can now sign in.`);
    onCreated();
  }

  async function copyCredentials() {
    if (!created) return;
    await navigator.clipboard.writeText(`Student ID: ${created.username}\nPassword: ${created.password}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={created ? "Student account created" : "Create student"}
      description={created ? undefined : "Assign a board and class from the real curriculum - the student will only see that curriculum."}
    >
      {created ? (
        <div className="space-y-4">
          <div className="rounded-xl border border-warning-200 bg-warning-50 p-4 text-sm dark:border-warning-900/40 dark:bg-warning-900/20">
            <p className="mb-3 font-medium text-warning-800 dark:text-warning-300">
              Save these credentials now. The password will not be shown again.
            </p>
            <div className="space-y-1.5 rounded-lg bg-white p-3 font-mono text-xs dark:bg-gray-950">
              <p className="text-gray-700 dark:text-gray-200">
                <span className="text-gray-400">Student ID:</span> {created.username}
              </p>
              <p className="text-gray-700 dark:text-gray-200">
                <span className="text-gray-400">Password:</span> {created.password}
              </p>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" className="gap-1.5" onClick={copyCredentials}>
              {copied ? <CheckCheck className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} {copied ? "Copied" : "Copy"}
            </Button>
            <Button onClick={handleClose}>Done</Button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className={labelClass}>Student name</label>
            <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} required disabled={submitting} />
          </div>
          <div>
            <label className={labelClass}>Student ID / Username</label>
            <input className={inputClass} value={username} onChange={(e) => setUsername(e.target.value)} required disabled={submitting} />
          </div>
          <div>
            <label className={labelClass}>Initial password</label>
            <input
              type="text"
              className={inputClass}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={submitting}
              placeholder="At least 8 characters, letters and numbers"
            />
          </div>
          <div>
            <label className={labelClass}>School</label>
            {lockedSchoolId ? (
              <p className={`${inputClass} bg-gray-50 text-gray-500 dark:bg-gray-800`}>
                {myAdmin?.schoolName ?? "Your school"} <span className="text-xs">(your school)</span>
              </p>
            ) : (
              <select className={inputClass} value={schoolId} onChange={(e) => setSchoolId(e.target.value)} disabled={submitting}>
                <option value="">No school</option>
                {enabledSchools.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            )}
          </div>
          <div>
            <label className={labelClass}>Board</label>
            {lockedBoardId ? (
              <p className={`${inputClass} bg-gray-50 text-gray-500 dark:bg-gray-800`}>
                {enabledBoards.find((b) => b.id === lockedBoardId)?.shortName ?? "Your school&apos;s board"} <span className="text-xs">(your school&apos;s board)</span>
              </p>
            ) : (
              <select
                className={inputClass}
                value={boardId}
                onChange={(e) => {
                  setBoardId(e.target.value);
                  setSchoolClassId("");
                }}
                required
                disabled={submitting || boards === null}
              >
                <option value="">{boards === null ? "Loading..." : "Select a board"}</option>
                {enabledBoards.map((b) => (
                  <option key={b.id} value={b.id}>{b.shortName} - {b.name}</option>
                ))}
              </select>
            )}
          </div>
          <div>
            <label className={labelClass}>Class</label>
            <select
              className={inputClass}
              value={schoolClassId}
              onChange={(e) => setSchoolClassId(e.target.value)}
              required
              disabled={submitting || !boardId}
            >
              <option value="">{boardId ? "Select a class" : "Select a board first"}</option>
              {availableClasses.map((c) => (
                <option key={c.id} value={c.id}>{c.label}</option>
              ))}
            </select>
          </div>

          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={handleClose} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting || !boardId || !schoolClassId}>
              {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} Create student
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
