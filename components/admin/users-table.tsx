"use client";
import * as React from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { adminUsers } from "@/lib/mock-data/admin";
import { formatDate, cn } from "@/lib/utils";
import type { UserRole } from "@/lib/types";

const roleFilters: { label: string; value: UserRole | "all" }[] = [
  { label: "All", value: "all" },
  { label: "Students", value: "student" },
  { label: "Parents", value: "parent" },
  { label: "Teachers", value: "teacher" },
  { label: "Admins", value: "admin" },
];

const statusVariant = {
  active: "success",
  suspended: "danger",
  pending: "warning",
} as const;

export function UsersTable() {
  const [filter, setFilter] = React.useState<UserRole | "all">("all");
  const visible = filter === "all" ? adminUsers : adminUsers.filter((u) => u.role === filter);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Users</CardTitle>
        <div className="flex flex-wrap gap-1.5">
          {roleFilters.map((f) => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className={cn(
                "rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
                filter === f.value
                  ? "bg-primary-600 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300"
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="w-full min-w-[560px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-left text-xs uppercase tracking-wide text-gray-400 dark:border-gray-800">
              <th className="py-2 pr-3 font-medium">Name</th>
              <th className="py-2 pr-3 font-medium">Email</th>
              <th className="py-2 pr-3 font-medium">Role</th>
              <th className="py-2 pr-3 font-medium">Status</th>
              <th className="py-2 pr-3 font-medium">Joined</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((u) => (
              <tr key={u.id} className="border-b border-gray-50 last:border-0 dark:border-gray-800/60">
                <td className="py-2.5 pr-3 font-medium text-gray-800 dark:text-gray-100">{u.name}</td>
                <td className="py-2.5 pr-3 text-gray-500 dark:text-gray-400">{u.email}</td>
                <td className="py-2.5 pr-3">
                  <Badge variant="outline" className="capitalize">{u.role}</Badge>
                </td>
                <td className="py-2.5 pr-3">
                  <Badge variant={statusVariant[u.status]} className="capitalize">{u.status}</Badge>
                </td>
                <td className="py-2.5 pr-3 text-gray-500 dark:text-gray-400">{formatDate(u.joinedDate)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
