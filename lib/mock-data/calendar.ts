import { CalendarEvent } from "@/lib/types";

// July 2026 is "today" (2026-07-19) so the calendar defaults to a month that
// already has a realistic mix of past and upcoming events.
export const calendarEvents: CalendarEvent[] = [
  { id: "ce-1", date: "2026-07-02", title: "Sets & Functions Chapter Test", subject: "Mathematics", type: "exam", time: "10:00 AM", description: "Chapter test covering Sets, Relations and Functions." },
  { id: "ce-2", date: "2026-07-04", title: "Revision: Trigonometric Identities", subject: "Mathematics", type: "revision", time: "7:00 AM" },
  { id: "ce-3", date: "2026-07-06", title: "Essay: The Portrait of a Lady", subject: "English", type: "assignment", description: "Due by end of day." },
  { id: "ce-4", date: "2026-07-08", title: "Mock Test: Physics Kinematics", subject: "Physics", type: "mock-test", time: "5:00 PM" },
  { id: "ce-5", date: "2026-07-09", title: "Study Session: Redox Reactions", subject: "Chemistry", type: "study-session", time: "5:00 PM - 6:00 PM" },
  { id: "ce-6", date: "2026-07-11", title: "Study Session: Hybridization", subject: "Chemistry", type: "study-session", time: "5:00 PM - 5:45 PM" },
  { id: "ce-7", date: "2026-07-14", title: "Sets & Relations Quiz", subject: "Mathematics", type: "exam", time: "9:00 AM" },
  { id: "ce-8", date: "2026-07-16", title: "Essay: The Portrait of a Lady (overdue)", subject: "English", type: "assignment" },
  { id: "ce-9", date: "2026-07-18", title: "Laws of Motion - Problem Set", subject: "Physics", type: "assignment", description: "Graded 42/50." },
  { id: "ce-10", date: "2026-07-19", title: "Practice: Redox Reactions (15 Qs)", subject: "Chemistry", type: "study-session", time: "5:00 PM - 5:30 PM" },
  { id: "ce-11", date: "2026-07-19", title: "Revision: Trigonometric Equations", subject: "Mathematics", type: "revision", time: "7:00 AM - 7:30 AM" },
  { id: "ce-12", date: "2026-07-21", title: "Trigonometric Identities Worksheet", subject: "Mathematics", type: "assignment", description: "Due today." },
  { id: "ce-13", date: "2026-07-21", title: "Revision: Permutations & Combinations", subject: "Mathematics", type: "revision", time: "6:30 PM" },
  { id: "ce-14", date: "2026-07-23", title: "Redox Reactions Lab Report", subject: "Chemistry", type: "assignment" },
  { id: "ce-15", date: "2026-07-25", title: "Cell Structure Diagram Labeling", subject: "Biology", type: "assignment" },
  { id: "ce-16", date: "2026-07-26", title: "Mock Test: Chemical Bonding", subject: "Chemistry", type: "mock-test", time: "4:00 PM" },
  { id: "ce-17", date: "2026-07-28", title: "Mathematics Unit Test 3", subject: "Mathematics", type: "exam", time: "10:00 AM", description: "Covers Permutations, Combinations and Conic Sections." },
  { id: "ce-18", date: "2026-07-29", title: "Study Session: Moment of Inertia", subject: "Physics", type: "study-session", time: "5:00 PM - 5:45 PM" },
  { id: "ce-19", date: "2026-07-31", title: "Revision Day: Full Syllabus Recap", subject: "All Subjects", type: "revision", time: "All day" },
  { id: "ce-20", date: "2026-08-05", title: "Physics Mid Term", subject: "Physics", type: "exam", time: "10:00 AM" },
  { id: "ce-21", date: "2026-08-12", title: "Chemistry Mock Exam", subject: "Chemistry", type: "mock-test", time: "9:00 AM" },
];

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

export function eventsForDate(dateStr: string): CalendarEvent[] {
  return calendarEvents.filter((e) => e.date === dateStr);
}
