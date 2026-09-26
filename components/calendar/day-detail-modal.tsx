import { Modal } from "@/components/ui/modal";
import { Badge } from "@/components/ui/badge";
import { eventTypeMeta } from "@/lib/calendar-meta";
import type { CalendarEvent } from "@/lib/types";
import { formatDate } from "@/lib/utils";

export function DayDetailModal({ date, events, onClose }: { date: string | null; events: CalendarEvent[]; onClose: () => void }) {
  return (
    <Modal
      open={Boolean(date)}
      onClose={onClose}
      title={date ? formatDate(date, { weekday: "long", month: "long", day: "numeric", year: "numeric" }) : undefined}
      description={events.length ? `${events.length} item${events.length > 1 ? "s" : ""} on this day` : "Nothing scheduled on this day."}
    >
      <div className="max-h-80 space-y-3 overflow-y-auto">
        {events.map((event) => {
          const meta = eventTypeMeta[event.type];
          return (
            <div key={event.id} className="rounded-xl border border-gray-100 p-3 dark:border-gray-800">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-gray-900 dark:text-gray-50">{event.title}</p>
                  <p className="text-xs text-gray-400">
                    {event.subject}
                    {event.time ? ` - ${event.time}` : ""}
                  </p>
                </div>
                <Badge variant={meta.badgeVariant}>{meta.label}</Badge>
              </div>
              {event.description && <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">{event.description}</p>}
            </div>
          );
        })}
        {events.length === 0 && (
          <p className="py-6 text-center text-sm text-gray-400">No exams, assignments, or study sessions on this day.</p>
        )}
      </div>
    </Modal>
  );
}
