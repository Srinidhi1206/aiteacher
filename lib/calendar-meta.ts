// Display metadata for calendar event types (label + dot color + badge). This
// is presentation only - the events themselves come from the database via
// lib/actions/student-calendar.ts.
import type { CalendarEvent } from "@/lib/types";

export const eventTypeMeta: Record<
  CalendarEvent["type"],
  { label: string; dot: string; badgeVariant: "primary" | "warning" | "success" | "danger" | "outline" }
> = {
  exam: { label: "Exam", dot: "bg-red-500", badgeVariant: "danger" },
  assignment: { label: "Assignment Due", dot: "bg-amber-500", badgeVariant: "warning" },
  revision: { label: "Revision Day", dot: "bg-sky-500", badgeVariant: "primary" },
  "mock-test": { label: "Mock Test", dot: "bg-primary-600", badgeVariant: "primary" },
  "study-session": { label: "Study Plan Session", dot: "bg-success-500", badgeVariant: "success" },
};
