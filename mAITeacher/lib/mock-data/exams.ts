import { Exam } from "@/lib/types";

export const upcomingExams: Exam[] = [
  {
    id: "exam-1",
    title: "Mathematics Unit Test 3",
    subject: "Mathematics",
    date: "2026-07-28",
    daysLeft: 9,
    syllabusCovered: 72,
    type: "Unit Test",
  },
  {
    id: "exam-2",
    title: "Physics Mid Term",
    subject: "Physics",
    date: "2026-08-05",
    daysLeft: 17,
    syllabusCovered: 54,
    type: "Mid Term",
  },
  {
    id: "exam-3",
    title: "Chemistry Mock Exam",
    subject: "Chemistry",
    date: "2026-08-12",
    daysLeft: 24,
    syllabusCovered: 61,
    type: "Mock Test",
  },
];
