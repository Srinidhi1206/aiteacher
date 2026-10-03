"use client";
// The real audit trail (lib/actions/admin-logs.ts): what was done, by whom,
// when - scoped to the admin's own school (super admin: whole platform).
import * as React from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DatabaseUnavailable } from "@/components/database-unavailable";
import { formatDate } from "@/lib/utils";
import { inputClass } from "@/components/register/field-styles";
import { listActivityLogs, listActivityLogActions, type ActivityLogRow } from "@/lib/actions/admin-logs";

export function LogsTable() {
  const [rows, setRows] = React.useState<ActivityLogRow[] | null>(null);
  const [unavailable, setUnavailable] = React.useState(false);
  const [actions, setActions] = React.useState<string[]>([]);
  const [action, setAction] = React.useState("");
  const [query, setQuery] = React.useState("");

  React.useEffect(() => {
    listActivityLogActions().then(setActions).catch(() => {});
  }, []);

  // Filters are applied on the server (so a search covers the whole history); the text box waits for a pause in typing.
  React.useEffect(() => {
    const t = setTimeout(() => {
      listActivityLogs({ action: action || undefined, query: query || undefined })
        .then((r) => {
          setRows(r);
          setUnavailable(false);
        })
        .catch(() => setUnavailable(true));
    }, query ? 300 : 0);
    return () => clearTimeout(t);
  }, [action, query]);

  if (unavailable) return <DatabaseUnavailable what="Activity log" />;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Activity Log</CardTitle>
        <CardDescription className="hidden sm:block">The 100 most recent matching actions. A school administrator sees their own school; the super administrator sees the whole platform.</CardDescription>
        <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-2">
          <input type="search" aria-label="Search the activity log" placeholder="Search details or username" value={query} onChange={(e) => setQuery(e.target.value)} className={`${inputClass} !py-1.5 !text-xs`} />
          <select aria-label="Filter by action" className={`${inputClass} !py-1.5 !text-xs`} value={action} onChange={(e) => setAction(e.target.value)}>
            <option value="">All actions</option>
            {actions.map((a) => (
              <option key={a} value={a}>
                {a.replace(/_/g, " ").toLowerCase()}
              </option>
            ))}
          </select>
        </div>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        {rows === null ? (
          <p className="py-6 text-center text-sm text-gray-400">Loading...</p>
        ) : rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-gray-400">{query || action ? "No activity matches these filters." : "No activity recorded yet."}</p>
        ) : (
          <table className="w-full min-w-[600px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-xs uppercase tracking-wide text-gray-400 dark:border-gray-800">
                <th className="py-2 pr-3 font-medium">Action</th>
                <th className="py-2 pr-3 font-medium">Details</th>
                <th className="py-2 pr-3 font-medium">By</th>
                <th className="py-2 pr-3 font-medium">Time</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((log) => (
                <tr key={log.id} className="border-b border-gray-50 last:border-0 dark:border-gray-800/60">
                  <td className="py-2.5 pr-3">
                    <Badge variant="outline" className="whitespace-nowrap">{log.action.replace(/_/g, " ").toLowerCase()}</Badge>
                  </td>
                  <td className="max-w-xs py-2.5 pr-3 text-gray-700 dark:text-gray-200">{log.message}</td>
                  <td className="py-2.5 pr-3 font-mono text-xs text-gray-400">{log.by ?? "-"}</td>
                  <td className="whitespace-nowrap py-2.5 pr-3 text-xs text-gray-400">
                    {formatDate(log.createdAt.toString(), { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}
