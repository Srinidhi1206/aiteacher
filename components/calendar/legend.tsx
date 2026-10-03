import { eventTypeMeta } from "@/lib/calendar-meta";
import type { CalendarEventType } from "@/lib/types";

const order: CalendarEventType[] = ["exam", "assignment", "revision", "mock-test", "study-session", "holiday", "result", "meeting", "event", "deadline", "term"];
const alwaysShown: CalendarEventType[] = ["exam", "assignment", "revision", "mock-test", "study-session"];

/** The five everyday types always, plus any school-calendar type that actually appears in the events being shown. */
export function CalendarLegend({ present = [] }: { present?: CalendarEventType[] }) {
  const shown = order.filter((t) => alwaysShown.includes(t) || present.includes(t));
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      {shown.map((type) => (
        <div key={type} className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
          <span className={`h-2.5 w-2.5 rounded-full ${eventTypeMeta[type].dot}`} />
          {eventTypeMeta[type].label}
        </div>
      ))}
    </div>
  );
}
