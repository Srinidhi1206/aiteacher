import { Notification } from "@/lib/types";

export const notifications: Notification[] = [
  {
    id: "n1",
    type: "streak",
    title: "12-day streak!",
    message: "You're on fire. Keep it going to hit your 14-day badge.",
    time: "10 min ago",
    read: false,
  },
  {
    id: "n2",
    type: "grade",
    title: "Assignment graded",
    message: "Your Physics assignment 'Laws of Motion' scored 42/50.",
    time: "1 hour ago",
    read: false,
  },
  {
    id: "n3",
    type: "reminder",
    title: "Study plan reminder",
    message: "Chemistry - Redox Reactions practice starts in 30 minutes.",
    time: "2 hours ago",
    read: false,
  },
  {
    id: "n4",
    type: "achievement",
    title: "Badge unlocked: Quick Learner",
    message: "You completed 5 lessons in a single day.",
    time: "Yesterday",
    read: true,
  },
  {
    id: "n5",
    type: "exam",
    title: "Exam approaching",
    message: "Mathematics Unit Test 3 is in 9 days. You're 72% ready.",
    time: "Yesterday",
    read: true,
  },
  {
    id: "n6",
    type: "system",
    title: "Weekly report ready",
    message: "Your performance summary for last week is now available.",
    time: "2 days ago",
    read: true,
  },
];
