import { AdminUser, AdminSubject, PromptTemplate, LogEntry, PlatformStat } from "@/lib/types";

export const adminUsers: AdminUser[] = [
  { id: "u-1", name: "Srinidhi Akkenapally", email: "akkenapallysrinidhi@gmail.com", role: "student", status: "active", joinedDate: "2026-04-02" },
  { id: "u-2", name: "Rekha Akkenapally", email: "rekha.parent@example.com", role: "parent", status: "active", joinedDate: "2026-04-02" },
  { id: "u-3", name: "Vikram Sharma", email: "vikram.sharma@school.edu", role: "teacher", status: "active", joinedDate: "2026-01-15" },
  { id: "u-4", name: "Ananya Rao", email: "ananya.rao@example.com", role: "student", status: "active", joinedDate: "2026-04-05" },
  { id: "u-5", name: "Kabir Mehta", email: "kabir.mehta@example.com", role: "student", status: "active", joinedDate: "2026-04-08" },
  { id: "u-6", name: "Priya Nataraj", email: "priya.nataraj@school.edu", role: "teacher", status: "active", joinedDate: "2025-11-20" },
  { id: "u-7", name: "Admin Ops", email: "ops@maiteacher.app", role: "admin", status: "active", joinedDate: "2025-09-01" },
  { id: "u-8", name: "Diya Patel", email: "diya.patel@example.com", role: "student", status: "suspended", joinedDate: "2026-03-11" },
  { id: "u-9", name: "Arjun Nair", email: "arjun.nair@example.com", role: "student", status: "pending", joinedDate: "2026-07-15" },
];

export const adminSubjects: AdminSubject[] = [
  { id: "as-1", name: "Mathematics", board: "CBSE", grade: "Class 11", chapterCount: 5, topicCount: 17 },
  { id: "as-2", name: "Physics", board: "CBSE", grade: "Class 11", chapterCount: 5, topicCount: 18 },
  { id: "as-3", name: "Chemistry", board: "CBSE", grade: "Class 11", chapterCount: 4, topicCount: 6 },
  { id: "as-4", name: "Biology", board: "CBSE", grade: "Class 11", chapterCount: 3, topicCount: 5 },
  { id: "as-5", name: "English", board: "CBSE", grade: "Class 11", chapterCount: 3, topicCount: 4 },
  { id: "as-6", name: "Mathematics", board: "ICSE", grade: "Class 10", chapterCount: 6, topicCount: 21 },
];

export const promptTemplates: PromptTemplate[] = [
  {
    id: "pt-1",
    name: "Lesson Explanation Prompt",
    description: "Generates the step-by-step recap + worked examples shown in the Lesson flow.",
    usedFor: "Subjects -> Chapters -> Topics -> Lesson",
    model: "claude-sonnet",
    template:
      "You are a patient CBSE tutor for {grade} {subject}. Explain {topic} at Bloom level {bloomLevel} using a short recap, one worked example, and a plain-language summary. Match the student's known weak points: {weakConcepts}.",
    lastEdited: "2026-07-10",
  },
  {
    id: "pt-2",
    name: "Socratic Tutor Prompt",
    description: "Drives the AI Tutor Chat's question-first, hint-before-answer conversation style.",
    usedFor: "AI Tutor Chat",
    model: "claude-sonnet",
    template:
      "Act as a Socratic tutor. Never give the final answer immediately. Ask a guiding question first, wait for the student's response, then progressively reveal hints for {topic}. Track prior turns: {conversationMemory}.",
    lastEdited: "2026-07-05",
  },
  {
    id: "pt-3",
    name: "Question Generation Prompt",
    description: "Generates practice paper and quiz questions across Bloom levels and difficulty bands.",
    usedFor: "Practice Papers, Custom Paper Generator",
    model: "claude-sonnet",
    template:
      "Generate {count} {questionType} questions for {subject} - {topic}, distributed across Bloom levels {bloomDistribution}. Difficulty: {difficulty}. Include an explanation and improvement tip for every question.",
    lastEdited: "2026-06-28",
  },
  {
    id: "pt-4",
    name: "Weakness Detection Prompt",
    description: "Analyzes attempt history to flag weak concepts and cluster related errors.",
    usedFor: "Weak Areas, Performance Analytics",
    model: "claude-haiku",
    template:
      "Given this attempt history: {attemptResults}, identify concepts with mastery below 50% or 2+ consecutive wrong answers. Cluster related errors and output a reason string per concept.",
    lastEdited: "2026-07-14",
  },
  {
    id: "pt-5",
    name: "Study Plan Generation Prompt",
    description: "Builds the daily/weekly study schedule from exam dates, weaknesses, and available hours.",
    usedFor: "Study Plan Engine, Exam Planner",
    model: "claude-sonnet",
    template:
      "Given exam dates {examDates}, weak topics {weakTopics}, and {hoursPerDay} available hours/day, generate a day-by-day plan with topic order, revision days, practice days, mock tests and buffer days.",
    lastEdited: "2026-07-16",
  },
];

export const activityLogs: LogEntry[] = [
  { id: "log-1", level: "info", message: "Study plan regenerated for student stu-001 after new exam date added.", source: "study-plan-engine", time: "2026-07-19 08:12" },
  { id: "log-2", level: "warning", message: "Material upload 'Conic_Sections_Scan.pdf' failed OCR extraction - low image quality.", source: "material-ingestion", time: "2026-07-19 07:45" },
  { id: "log-3", level: "info", message: "Weakness detector flagged 'Ellipse & Hyperbola' as declining for stu-001.", source: "weakness-detection", time: "2026-07-18 21:03" },
  { id: "log-4", level: "error", message: "Question generation timed out for Chemistry - Hybridization (retried once, succeeded).", source: "question-engine", time: "2026-07-18 18:30" },
  { id: "log-5", level: "info", message: "New teacher account created: Priya Nataraj (Chemistry, Class 10).", source: "auth-service", time: "2026-07-17 11:20" },
  { id: "log-6", level: "warning", message: "Parent notification digest delayed by 6 minutes due to queue backlog.", source: "notifications", time: "2026-07-17 09:05" },
  { id: "log-7", level: "info", message: "Report export requested by teacher u-3 for Class 11 - Section A.", source: "reporting", time: "2026-07-16 16:42" },
];

export const platformStats: PlatformStat[] = [
  { id: "ps-1", label: "Total Users", value: "12,480", change: "+3.2% this month", icon: "Users" },
  { id: "ps-2", label: "Active Students (7d)", value: "8,910", change: "+1.8% this week", icon: "GraduationCap" },
  { id: "ps-3", label: "Lessons Completed", value: "214,320", change: "+5,120 this week", icon: "BookOpen" },
  { id: "ps-4", label: "Questions Answered", value: "1.86M", change: "+42,900 this week", icon: "ListChecks" },
  { id: "ps-5", label: "Avg. Session Length", value: "24 min", change: "+1 min vs last month", icon: "Gauge" },
  { id: "ps-6", label: "System Uptime", value: "99.97%", change: "Last 30 days", icon: "Server" },
];
