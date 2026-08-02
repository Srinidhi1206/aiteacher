import { eventTypeMeta } from "@/lib/mock-data/calendar";
import type { CalendarEventType } from "@/lib/types";

const order: CalendarEventType[] = ["exam", "assignment", "revision", "mock-test", "study-session"];

export function CalendarLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      {order.map((type) => (
        <div key={type} className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
          <span className={`h-2.5 w-2.5 rounded-full ${eventTypeMeta[type].dot}`} />
          {eventTypeMeta[type].label}
        </div>
      ))}
    </div>
  );
}
