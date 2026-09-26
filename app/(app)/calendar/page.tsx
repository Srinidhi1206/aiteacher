// Real calendar: published exam schedules and assignment due dates for the
// student's own school + class, plus their own planner and study plan
// (lib/actions/student-calendar.ts). Replaces the built-in sample events.
import { Topbar } from "@/components/layout/topbar";
import { CalendarView } from "@/components/calendar/calendar-view";
import { DatabaseUnavailable } from "@/components/database-unavailable";
import { getMyCalendarEvents } from "@/lib/actions/student-calendar";

export default async function CalendarPage() {
  let events: Awaited<ReturnType<typeof getMyCalendarEvents>>;
  try {
    events = await getMyCalendarEvents();
  } catch {
    return (
      <>
        <Topbar title="Calendar" />
        <main className="flex-1 p-4 sm:p-6">
          <DatabaseUnavailable what="Your calendar" />
        </main>
      </>
    );
  }

  return (
    <>
      <Topbar title="Calendar" />
      <main className="flex-1 space-y-3 p-4 sm:p-6">
        {events.length === 0 && (
          <p className="rounded-xl border border-gray-100 bg-white px-4 py-3 text-sm text-gray-500 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400">
            Nothing is scheduled yet. Exams your school schedules, assignment due dates and your study plan will show up here.
          </p>
        )}
        <CalendarView events={events} />
      </main>
    </>
  );
}
