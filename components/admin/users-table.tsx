"use client";
// Stage F: real admin user-management + registration approval. Fetches via
// the server actions in lib/actions/user-management.ts (client-side, since
// this component lives inside AdminTabs' client boundary - see that file
// for why an async Server Component can't be used here instead). Every
// approve/reject/suspend/reactivate button is a convenience only: the
// actual authorization (e.g. "only a super admin may approve an admin") is
// enforced server-side on every call, regardless of what this UI shows.
import * as React from "react";
import { Check, X, Ban, RotateCcw, ShieldAlert, Loader2 } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { DatabaseUnavailable } from "@/components/database-unavailable";
import { useToast } from "@/components/ui/toast";
import { formatDate } from "@/lib/utils";
import {
  listUsersForAdmin,
  approveRegistration,
  rejectRegistration,
  suspendUser,
  reactivateUser,
  getMyAdminStatus,
} from "@/lib/actions/user-management";

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

export function UsersTable() {
  const [users, setUsers] = React.useState<AdminUserRow[] | null>(null);
  const [dbUnavailable, setDbUnavailable] = React.useState(false);
  const [unauthorized, setUnauthorized] = React.useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = React.useState(false);
  const [statusFilter, setStatusFilter] = React.useState<StatusFilter>("PENDING");
  const [roleFilter, setRoleFilter] = React.useState<RoleFilterValue>("ALL");
  const [actingUserId, setActingUserId] = React.useState<string | null>(null);
  const [rejectTarget, setRejectTarget] = React.useState<AdminUserRow | null>(null);
  const [rejectReason, setRejectReason] = React.useState("");
  const { showToast } = useToast();

  const refresh = React.useCallback(async () => {
    try {
      const [rows, status] = await Promise.all([listUsersForAdmin(), getMyAdminStatus()]);
      setUsers(rows);
      setIsSuperAdmin(status?.isSuperAdmin ?? false);
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

  const visible = (users ?? []).filter((u) => {
    if (statusFilter !== "ALL" && u.status !== statusFilter) return false;
    if (roleFilter !== "ALL" && u.role !== roleFilter) return false;
    return true;
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Users &amp; Registration Requests</CardTitle>
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
      </CardHeader>
      <CardContent className="overflow-x-auto">
        {users === null ? (
          <p className="py-8 text-center text-sm text-gray-400">Loading...</p>
        ) : visible.length === 0 ? (
          <p className="py-8 text-center text-sm text-gray-400">No users match this filter.</p>
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
    </Card>
  );
}
