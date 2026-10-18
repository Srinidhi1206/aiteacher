// The "Online exams to take" part of the dashboard's Exams & Results card. Presentational only (no data fetching), so it can be rendered and tested on its own. See
// lib/dashboard/online-exams.ts for what it lists - and what it deliberately does not.
import Link from "next/link";
import { ONLINE_EXAMS_EMPTY, ONLINE_EXAMS_HEADING } from "@/lib/dashboard/online-exams";

export function OnlineExamsList({ exams }: { exams: { id: string; title: string; subject: { name: string } }[] }) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-400">{ONLINE_EXAMS_HEADING}</p>
      {exams.length === 0 ? (
        <p className="text-sm text-gray-400">{ONLINE_EXAMS_EMPTY}</p>
      ) : (
        exams.map((e) => (
          <Link key={e.id} href={`/exams/${e.id}/attempt`} className="flex items-center justify-between rounded-xl px-2 py-1.5 text-sm hover:bg-gray-50 dark:hover:bg-gray-800">
            <span className="text-gray-800 dark:text-gray-100">{e.title}</span>
            <span className="text-xs text-gray-400">{e.subject.name}</span>
          </Link>
        ))
      )}
    </div>
  );
}
