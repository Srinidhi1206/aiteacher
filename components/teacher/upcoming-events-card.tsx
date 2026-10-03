// Teacher dashboard: what is coming up at the school for the classes this teacher teaches - holidays, exam dates the
// administrator scheduled, meetings, deadlines. Read-only; the administrator maintains the calendar. Fails soft, so an
// unavailable calendar never takes the teacher's other tools down.
import { CalendarClock } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getMyUpcomingForTeacher } from "@/lib/actions/teacher-calendar";
import { formatDate } from "@/lib/utils";

export async function UpcomingEventsCard() {
  let items: Awaited<ReturnType<typeof getMyUpcomingForTeacher>> | null = null;
  try {
    items = await getMyUpcomingForTeacher();
  } catch {
    items = null;
  }
  const day = (iso: string) => formatDate(iso, { month: "short", day: "numeric", timeZone: "UTC" });
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarClock className="h-4 w-4 text-red-500" /> Coming up at school
        </CardTitle>
      </CardHeader>
      <CardContent>
        {items === null ? (
          <p className="py-2 text-sm text-gray-400">The school calendar couldn&apos;t be loaded right now - refresh in a moment.</p>
        ) : items.length === 0 ? (
          <p className="py-2 text-sm text-gray-400">Nothing is scheduled for your classes yet. Holidays, exam dates and school events set by your administrator will show up here.</p>
        ) : (
          <ul className="divide-y divide-gray-50 dark:divide-gray-800">
            {items.map((i) => (
              <li key={i.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span className="min-w-0">
                  <span className="block truncate font-medium text-gray-800 dark:text-gray-100">{i.title}</span>
                  <span className="text-xs text-gray-400">{i.detail}</span>
                </span>
                <span className="flex shrink-0 flex-col items-end gap-1">
                  <Badge variant={i.kind === "exam" ? "danger" : "outline"}>{i.typeLabel}</Badge>
                  <span className="text-xs text-gray-400">
                    {day(i.startDate)}
                    {i.endDate && day(i.endDate) !== day(i.startDate) ? ` - ${day(i.endDate)}` : ""}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
