// The student's learning hub, at the top of the dashboard: their subjects, what is due, what is coming up and what is new.
// Everything comes from the same student-scoped actions the full pages use (subjects, assignments, calendar,
// materials), so the hub can never show anything the student could not already open. Each card loads on its own and
// fails soft: one unavailable source leaves a quiet note in that card instead of taking the dashboard down.
import Link from "next/link";
import { BookOpen, ClipboardList, CalendarClock, FileText, ArrowRight } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getCurrentSession } from "@/lib/auth/current-session";
import { getMySubjects } from "@/lib/actions/student-curriculum";
import { listWorksheetsForStudent } from "@/lib/actions/worksheets";
import { getMyCalendarEvents } from "@/lib/actions/student-calendar";
import { listMaterialsForStudent } from "@/lib/actions/materials";
import { eventTypeMeta } from "@/lib/calendar-meta";
import { formatDate } from "@/lib/utils";

const DAY = 24 * 60 * 60 * 1000;
const UPCOMING_WINDOW_DAYS = 30;

function Unavailable() {
  return <p className="py-3 text-sm text-gray-400">This couldn&apos;t be loaded right now - refresh in a moment.</p>;
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="py-3 text-sm text-gray-400">{children}</p>;
}

function CardLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="inline-flex items-center gap-1 text-xs font-medium text-primary-600 hover:underline dark:text-primary-300">
      {children} <ArrowRight className="h-3 w-3" />
    </Link>
  );
}

export async function LearningHub() {
  const session = await getCurrentSession();
  if (!session || session.role !== "student") return null;

  const [subjectsRes, worksheetsRes, eventsRes, materialsRes] = await Promise.allSettled([
    getMySubjects(),
    listWorksheetsForStudent(),
    getMyCalendarEvents(),
    listMaterialsForStudent(),
  ]);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Assignments still to hand in: overdue first (the most urgent), then by due date; undated ones last.
  const due =
    worksheetsRes.status === "fulfilled"
      ? worksheetsRes.value
          .filter((w) => !w.submissions[0]?.submittedAt)
          .map((w) => ({ w, overdue: w.dueDate !== null && w.dueDate.getTime() < today.getTime() }))
          .sort((a, b) => (a.w.dueDate?.getTime() ?? Infinity) - (b.w.dueDate?.getTime() ?? Infinity))
      : [];

  // Dated things in the next month. The study plan's own sessions are left out - they have their own page.
  const horizon = today.getTime() + UPCOMING_WINDOW_DAYS * DAY;
  const upcoming =
    eventsRes.status === "fulfilled"
      ? eventsRes.value
          .filter((e) => e.type !== "study-session" && e.type !== "revision")
          .filter((e) => {
            const t = new Date(`${e.date}T00:00:00`).getTime();
            return t >= today.getTime() && t <= horizon;
          })
          .sort((a, b) => a.date.localeCompare(b.date))
          .slice(0, 5)
      : [];

  const newest =
    materialsRes.status === "fulfilled"
      ? [...materialsRes.value].sort((a, b) => b.uploadedAt.getTime() - a.uploadedAt.getTime()).slice(0, 3)
      : [];

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="flex items-center gap-2 text-base">
            <BookOpen className="h-4 w-4 text-primary-600" /> Your subjects
          </CardTitle>
          <CardLink href="/subjects">All subjects</CardLink>
        </CardHeader>
        <CardContent>
          {subjectsRes.status === "rejected" ? (
            <Unavailable />
          ) : subjectsRes.value.subjects.length === 0 ? (
            <Empty>No subjects are set up for your class yet.</Empty>
          ) : (
            <ul className="divide-y divide-gray-50 dark:divide-gray-800">
              {subjectsRes.value.subjects.slice(0, 10).map((s) => (
                <li key={s.id}>
                  <Link href={`/subjects/${s.id}`} className="flex items-center justify-between gap-3 py-2 text-sm hover:text-primary-600">
                    <span className="font-medium text-gray-800 dark:text-gray-100">{s.name}</span>
                    <span className="text-xs text-gray-400">
                      {s.chapterCount === 0 ? "No chapters yet" : `${s.chapterCount} chapter${s.chapterCount === 1 ? "" : "s"}`}
                      {s.materialCount > 0 ? ` - ${s.materialCount} material${s.materialCount === 1 ? "" : "s"}` : ""}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="flex items-center gap-2 text-base">
            <ClipboardList className="h-4 w-4 text-amber-500" /> Assignments to hand in
          </CardTitle>
          <CardLink href="/assignments">All assignments</CardLink>
        </CardHeader>
        <CardContent>
          {worksheetsRes.status === "rejected" ? (
            <Unavailable />
          ) : due.length === 0 ? (
            <Empty>Nothing to hand in right now.</Empty>
          ) : (
            <ul className="divide-y divide-gray-50 dark:divide-gray-800">
              {due.slice(0, 4).map(({ w, overdue }) => (
                <li key={w.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-gray-800 dark:text-gray-100">{w.title}</span>
                    <span className="text-xs text-gray-400">{w.subject.name}</span>
                  </span>
                  {w.dueDate ? (
                    <Badge variant={overdue ? "danger" : "warning"}>
                      {overdue ? "Overdue - " : "Due "}
                      {formatDate(w.dueDate, { month: "short", day: "numeric", timeZone: "UTC" })}
                    </Badge>
                  ) : (
                    <Badge variant="outline">No due date</Badge>
                  )}
                </li>
              ))}
              {due.length > 4 && <li className="py-2 text-xs text-gray-400">and {due.length - 4} more</li>}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarClock className="h-4 w-4 text-red-500" /> Coming up (next {UPCOMING_WINDOW_DAYS} days)
          </CardTitle>
          <CardLink href="/calendar">Calendar</CardLink>
        </CardHeader>
        <CardContent>
          {eventsRes.status === "rejected" ? (
            <Unavailable />
          ) : upcoming.length === 0 ? (
            <Empty>No exams, holidays or deadlines are scheduled for you in the next {UPCOMING_WINDOW_DAYS} days.</Empty>
          ) : (
            <ul className="divide-y divide-gray-50 dark:divide-gray-800">
              {upcoming.map((e) => (
                <li key={e.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className={`h-2 w-2 shrink-0 rounded-full ${eventTypeMeta[e.type].dot}`} />
                    <span className="truncate font-medium text-gray-800 dark:text-gray-100">{e.title}</span>
                  </span>
                  <span className="shrink-0 text-xs text-gray-400">
                    {eventTypeMeta[e.type].label} - {formatDate(`${e.date}T00:00:00`, { month: "short", day: "numeric" })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="flex items-center gap-2 text-base">
            <FileText className="h-4 w-4 text-sky-500" /> Newest study materials
          </CardTitle>
          <CardLink href="/materials">All materials</CardLink>
        </CardHeader>
        <CardContent>
          {materialsRes.status === "rejected" ? (
            <Unavailable />
          ) : newest.length === 0 ? (
            <Empty>No study materials have been published for your class yet.</Empty>
          ) : (
            <ul className="divide-y divide-gray-50 dark:divide-gray-800">
              {newest.map((m) => (
                <li key={m.id} className="py-2 text-sm">
                  <a href={m.fileUrl} target="_blank" rel="noopener noreferrer" className="block truncate font-medium text-gray-800 hover:text-primary-600 dark:text-gray-100">
                    {m.title}
                  </a>
                  <span className="text-xs text-gray-400">
                    {m.subject.name} - {m.chapter?.name ?? "Whole subject"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
