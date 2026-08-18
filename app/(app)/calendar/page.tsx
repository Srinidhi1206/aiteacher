import { Topbar } from "@/components/layout/topbar";
import { CalendarView } from "@/components/calendar/calendar-view";

export default function CalendarPage() {
  return (
    <>
      <Topbar title="Calendar" />
      <main className="flex-1 p-4 sm:p-6">
        <CalendarView />
      </main>
    </>
  );
}
