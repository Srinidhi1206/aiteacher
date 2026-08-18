import { StudyTask, RevisionAlert, StudyPlanScheduleItem, StudyPlanInputSummary, ExamPlanInput, ExamPlanOutput } from "@/lib/types";

export const todayTasks: StudyTask[] = [
  { id: "task-1", title: "Review Trigonometric Equations", subject: "Mathematics", time: "7:00 AM - 7:30 AM", type: "revision", completed: true },
  { id: "task-2", title: "Lesson: Friction & Laws of Motion", subject: "Physics", time: "4:00 PM - 4:45 PM", type: "lesson", completed: true },
  { id: "task-3", title: "Practice: Redox Reactions (15 Qs)", subject: "Chemistry", time: "5:00 PM - 5:30 PM", type: "practice", completed: false },
  { id: "task-4", title: "Submit Essay: Portrait of a Lady", subject: "English", time: "6:00 PM - 6:15 PM", type: "assignment", completed: false },
  { id: "task-5", title: "Quiz: Cell Structure & Function", subject: "Biology", time: "7:30 PM - 8:00 PM", type: "quiz", completed: false },
];

export const revisionAlerts: RevisionAlert[] = [
  { id: "rev-1", topic: "Permutations & Combinations", subject: "Mathematics", reason: "Mastery dropped below 40% - review recommended", dueDate: "2026-07-20" },
  { id: "rev-2", topic: "Dimensional Analysis", subject: "Physics", reason: "Not revisited in 14 days", dueDate: "2026-07-21" },
  { id: "rev-3", topic: "Oxidation Numbers", subject: "Chemistry", reason: "Low score on last practice test", dueDate: "2026-07-22" },
];

// ---------------------------------------------------------------------------
// Auto-generated Study Plan (drives the "My Plan" view on /study-plan)
// ---------------------------------------------------------------------------

// The inputs the (mocked) planner algorithm claims to have used to build the
// schedule below. Shown in the "How your plan is built" explainer so the
// generated timeline doesn't feel like a black box.
export const studyPlanInputs: StudyPlanInputSummary[] = [
  { label: "Upcoming Exams", value: "Maths Unit Test 3 (Jul 28), Physics Mid Term (Aug 5), Chemistry Mock (Aug 12)" },
  { label: "Available Study Hours", value: "2.5 hrs / weekday, 4 hrs / weekend" },
  { label: "Flagged Weaknesses", value: "Permutations, Ellipse & Hyperbola, Friction, Redox Reactions" },
  { label: "Topic Importance", value: "Weighted by exam weightage + Bloom level gap" },
  { label: "Buffer Policy", value: "1 buffer day inserted every 6 study days" },
];

export const studyPlanSchedule: StudyPlanScheduleItem[] = [
  { id: "sp-1", day: 1, date: "2026-07-20", kind: "topic", subject: "Mathematics", title: "Permutations - core counting principles", durationMinutes: 45, completed: true },
  { id: "sp-2", day: 1, date: "2026-07-20", kind: "practice", subject: "Mathematics", title: "10 practice questions on Permutations", durationMinutes: 30, completed: true },
  { id: "sp-3", day: 2, date: "2026-07-21", kind: "topic", subject: "Mathematics", title: "Combinations - fundamentals", durationMinutes: 45, completed: false },
  { id: "sp-4", day: 2, date: "2026-07-21", kind: "revision", subject: "Mathematics", title: "Revisit Trigonometric Equations", durationMinutes: 30, completed: false },
  { id: "sp-5", day: 3, date: "2026-07-22", kind: "topic", subject: "Physics", title: "Friction - static vs kinetic", durationMinutes: 45, completed: false },
  { id: "sp-6", day: 3, date: "2026-07-22", kind: "practice", subject: "Physics", title: "Friction problem set (12 Qs)", durationMinutes: 30, completed: false },
  { id: "sp-7", day: 4, date: "2026-07-23", kind: "topic", subject: "Chemistry", title: "Balancing Redox Equations - ion-electron method", durationMinutes: 45, completed: false },
  { id: "sp-8", day: 4, date: "2026-07-23", kind: "practice", subject: "Chemistry", title: "Redox balancing drill (10 Qs)", durationMinutes: 30, completed: false },
  { id: "sp-9", day: 5, date: "2026-07-24", kind: "revision", subject: "Mathematics", title: "Full revision: Permutations & Combinations", durationMinutes: 40, completed: false },
  { id: "sp-10", day: 5, date: "2026-07-24", kind: "practice", subject: "Mathematics", title: "Mixed practice paper (15 Qs)", durationMinutes: 35, completed: false },
  { id: "sp-11", day: 6, date: "2026-07-25", kind: "mock-test", subject: "Mathematics", title: "Mini mock: Permutations & Combinations", durationMinutes: 40, completed: false },
  { id: "sp-12", day: 6, date: "2026-07-25", kind: "topic", subject: "Physics", title: "Circular motion - intro", durationMinutes: 30, completed: false },
  { id: "sp-13", day: 7, date: "2026-07-26", kind: "buffer", subject: "All Subjects", title: "Buffer day - catch up or rest", durationMinutes: 0, completed: false },
  { id: "sp-14", day: 8, date: "2026-07-27", kind: "revision", subject: "Mathematics", title: "Final revision before Unit Test 3", durationMinutes: 60, completed: false },
  { id: "sp-15", day: 8, date: "2026-07-27", kind: "practice", subject: "Mathematics", title: "Timed mock paper - full syllabus", durationMinutes: 60, completed: false },
  { id: "sp-16", day: 9, date: "2026-07-28", kind: "mock-test", subject: "Mathematics", title: "Mathematics Unit Test 3", durationMinutes: 90, completed: false },
  { id: "sp-17", day: 10, date: "2026-07-29", kind: "topic", subject: "Physics", title: "Moment of Inertia - standard bodies", durationMinutes: 45, completed: false },
  { id: "sp-18", day: 10, date: "2026-07-29", kind: "practice", subject: "Physics", title: "Torque & angular momentum questions", durationMinutes: 30, completed: false },
  { id: "sp-19", day: 11, date: "2026-07-30", kind: "revision", subject: "Physics", title: "Revisit Dimensional Analysis", durationMinutes: 30, completed: false },
  { id: "sp-20", day: 12, date: "2026-07-31", kind: "buffer", subject: "All Subjects", title: "Buffer day - full syllabus recap", durationMinutes: 0, completed: false },
];

// ---------------------------------------------------------------------------
// Exam Planner - client-side mock "generator"
// ---------------------------------------------------------------------------

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function daysBetween(from: string, to: string): number {
  const a = new Date(from).setHours(0, 0, 0, 0);
  const b = new Date(to).setHours(0, 0, 0, 0);
  return Math.max(1, Math.round((b - a) / (1000 * 60 * 60 * 24)));
}

export function generateExamPlan(input: ExamPlanInput): ExamPlanOutput {
  const today = "2026-07-19";
  const totalDays = daysBetween(today, input.examDate);
  const chapters = input.chapters.length ? input.chapters : ["General Revision"];

  // Reserve the final ~15% of the runway for last-minute revision + mock tests.
  const revisionStart = Math.max(1, Math.floor(totalDays * 0.7));
  const mockTestStart = Math.max(revisionStart + 1, Math.floor(totalDays * 0.85));

  const dailyGoals = Array.from({ length: Math.min(totalDays, 30) }, (_, i) => {
    const day = i + 1;
    const date = addDays(today, day);
    let goal: string;
    if (day < revisionStart) {
      const chapter = chapters[i % chapters.length];
      goal = `Study & practice: ${chapter}`;
    } else if (day < mockTestStart) {
      goal = `Revision block - ${chapters[i % chapters.length]}`;
    } else {
      goal = "Mock test + targeted revision of weak topics";
    }
    return { day, date, goal, hours: input.availableHoursPerDay };
  });

  const weeks = Math.max(1, Math.ceil(totalDays / 7));
  const weeklyGoals = Array.from({ length: Math.min(weeks, 8) }, (_, i) => {
    const weekNum = i + 1;
    if (weekNum === weeks) {
      return { week: weekNum, goal: `Final week: full mock exam + last-minute revision for ${input.examName}` };
    }
    const chunkStart = i * Math.ceil(chapters.length / weeks);
    const chunk = chapters.slice(chunkStart, chunkStart + Math.ceil(chapters.length / weeks));
    return {
      week: weekNum,
      goal: chunk.length
        ? `Cover & practice: ${chunk.join(", ")}`
        : `Consolidation and mixed practice across all chapters`,
    };
  });

  const revisionSchedule = chapters.map((chapter, i) => ({
    date: addDays(today, revisionStart + i),
    topic: chapter,
  }));

  const mockTestSchedule = [
    { date: addDays(today, mockTestStart), title: `${input.examName} - Full Mock Test 1` },
    { date: addDays(today, Math.min(totalDays - 1, mockTestStart + 3)), title: `${input.examName} - Full Mock Test 2` },
  ];

  const lastMinutePlan = [
    `1 day before: Skim formula sheets and summary notes for ${chapters.join(", ")} - no new topics.`,
    "1 day before: Redo the questions you got wrong in both mock tests.",
    "Morning of exam: Light revision only (30-40 min), review flagged weak concepts.",
    "Morning of exam: Eat well, arrive early, skim through the full paper before answering.",
  ];

  return {
    input,
    totalDays,
    dailyGoals,
    weeklyGoals,
    revisionSchedule,
    mockTestSchedule,
    lastMinutePlan,
  };
}
