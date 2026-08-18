// Shared TypeScript types for mAITeacher
// This file is the single source of truth for domain models used across
// mock data and UI. Later phases should extend these interfaces rather
// than duplicating shapes in individual pages/components.

export type BloomLevel = "Remember" | "Understand" | "Apply" | "Analyze";

export const BLOOM_LEVELS: BloomLevel[] = ["Remember", "Understand", "Apply", "Analyze"];

export type GradeStage = "Primary" | "Middle School" | "High School" | "College" | "University";

export type Curriculum = "CBSE" | "ICSE" | "State Board" | "IB" | "IGCSE" | "University";

export interface Student {
  id: string;
  name: string;
  email: string;
  avatarInitials: string;
  avatarColor: string;
  grade: string;
  gradeStage: GradeStage;
  curriculum: Curriculum;
  board?: string;
  streakDays: number;
  xp: number;
  level: number;
  xpToNextLevel: number;
  joinedDate: string;
}

export interface Topic {
  id: string;
  slug: string;
  name: string;
  bloomLevel: BloomLevel;
  mastery: number;
  status: "weak" | "developing" | "strong";
}

export interface Chapter {
  id: string;
  slug: string;
  name: string;
  topics: Topic[];
  progress: number;
}

export interface Subject {
  id: string;
  slug: string;
  name: string;
  icon: string;
  color: string;
  progress: number;
  chapters: Chapter[];
  currentBloomLevel: BloomLevel;
  weakTopics: string[];
  strongTopics: string[];
  nextTopic: string;
}

// ---------------------------------------------------------------------------
// Topic deep-dive content (Subjects -> Chapters -> Topics -> Lesson flow)
// ---------------------------------------------------------------------------

export interface Flashcard {
  id: string;
  front: string;
  back: string;
}

export interface WorkedExample {
  title: string;
  problem: string;
  steps: string[];
  answer: string;
}

export interface Illustration {
  title: string;
  caption: string;
  kind: "diagram" | "graph" | "chart" | "figure";
}

export interface Formula {
  name: string;
  expression: string;
  description: string;
}

export interface TopicApplication {
  title: string;
  description: string;
}

export interface TopicContent {
  objectives: string[];
  theory: string[];
  illustrations: Illustration[];
  examples: WorkedExample[];
  applications: TopicApplication[];
  formulae: Formula[];
  summary: string[];
  flashcards: Flashcard[];
  revisionNotes: string[];
}

// ---------------------------------------------------------------------------
// Lesson flow (interactive step-by-step lesson per topic)
// ---------------------------------------------------------------------------

export type LessonQuestionType = "mcq" | "fill-blank" | "true-false" | "short-answer";

export interface LessonQuestion {
  id: string;
  bloomLevel: 1 | 2 | 3 | 4;
  type: LessonQuestionType;
  prompt: string;
  options?: string[];
  correctAnswer: string;
  explanation: string;
  reteach: string;
  hint?: string;
  xp: number;
}

export interface LessonPlan {
  topicId: string;
  recap: string[];
  examples: WorkedExample[];
  questions: LessonQuestion[];
}

// ---------------------------------------------------------------------------
// Practice papers / question engine
// ---------------------------------------------------------------------------

export type PaperQuestionType =
  | "mcq"
  | "fill-blank"
  | "true-false"
  | "short-answer"
  | "long-answer"
  | "case-study"
  | "diagram";

export interface PaperQuestion {
  id: string;
  type: PaperQuestionType;
  bloomLevel: 1 | 2 | 3 | 4;
  marks: number;
  topic: string;
  prompt: string;
  scenario?: string;
  diagramCaption?: string;
  options?: string[];
  correctAnswer: string;
  explanation: string;
  improvementTip: string;
}

export type PaperType =
  | "Chapter Test"
  | "Weekly Test"
  | "Monthly Test"
  | "Mock Exam"
  | "Previous Pattern Paper"
  | "Final Exam";

export interface Paper {
  id: string;
  title: string;
  type: PaperType;
  subject: string;
  topics: string[];
  questionCount: number;
  totalMarks: number;
  durationMinutes: number;
  difficulty: "Easy" | "Medium" | "Hard" | "Mixed";
  bloomDistribution: { level: 1 | 2 | 3 | 4; count: number }[];
  questions: PaperQuestion[];
  isCustom?: boolean;
}

export interface Attempt {
  paperId: string;
  answers: Record<string, string>;
  flagged: string[];
  startedAt: string;
  timeTakenSeconds: number;
}

export interface AttemptQuestionResult {
  questionId: string;
  topic: string;
  bloomLevel: 1 | 2 | 3 | 4;
  type: PaperQuestionType;
  prompt: string;
  studentAnswer: string;
  correctAnswer: string;
  isCorrect: boolean;
  marksAwarded: number;
  marks: number;
  explanation: string;
  improvementTip: string;
}

export interface AttemptResult {
  paperId: string;
  paperTitle: string;
  scoreObtained: number;
  totalMarks: number;
  accuracy: number;
  conceptUnderstanding: number;
  timeTakenMinutes: number;
  weakConcepts: string[];
  missingKnowledge: string[];
  commonErrors: string[];
  topicBreakdown: { topic: string; scored: number; total: number }[];
  bloomBreakdown: { level: number; label: string; scored: number; total: number }[];
  perQuestion: AttemptQuestionResult[];
}

// ---------------------------------------------------------------------------
// AI Tutor chat
// ---------------------------------------------------------------------------

export interface ChatMessage {
  id: string;
  role: "student" | "ai";
  content: string;
  time: string;
}

export interface Conversation {
  id: string;
  title: string;
  subject?: string;
  lastMessage: string;
  updatedAt: string;
}

export interface ProgressPoint {
  label: string;
  date: string;
  value: number;
  xp?: number;
}

export interface MonthlyProgressPoint {
  month: string;
  score: number;
  hoursStudied: number;
}

export interface HeatmapDay {
  date: string;
  count: number;
}

export interface Exam {
  id: string;
  title: string;
  subject: string;
  date: string;
  daysLeft: number;
  syllabusCovered: number;
  type: "Unit Test" | "Mid Term" | "Final" | "Board Exam" | "Mock Test";
}

export interface Assignment {
  id: string;
  title: string;
  subject: string;
  dueDate: string;
  status: "pending" | "submitted" | "graded" | "overdue";
  score?: number;
  maxScore?: number;
  targetConcept?: string;
  bloomLevel?: BloomLevel;
  questionCount?: number;
  personalized?: boolean;
}

export interface PracticeTest {
  id: string;
  title: string;
  subject: string;
  dateTaken?: string;
  score?: number;
  maxScore: number;
  questionCount: number;
  durationMinutes: number;
  status: "not-started" | "in-progress" | "completed";
}

export interface StudyTask {
  id: string;
  title: string;
  subject: string;
  time: string;
  type: "lesson" | "practice" | "revision" | "assignment" | "quiz";
  completed: boolean;
}

export interface StudyPlanDay {
  date: string;
  tasks: StudyTask[];
}

export type NotificationType = "reminder" | "achievement" | "grade" | "streak" | "system" | "exam";

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  time: string;
  read: boolean;
}

export interface Achievement {
  id: string;
  title: string;
  description: string;
  icon: string;
  unlocked: boolean;
  unlockedDate?: string;
  progress?: number;
  category: "streak" | "mastery" | "practice" | "milestone" | "social";
}

export interface RevisionAlert {
  id: string;
  topic: string;
  subject: string;
  reason: string;
  dueDate: string;
}

export interface WeeklyDot {
  day: string;
  active: boolean;
  isToday?: boolean;
}

// ---------------------------------------------------------------------------
// Performance analytics (/performance)
// ---------------------------------------------------------------------------

export interface SkillRadarPoint {
  skill: string;
  subject: string;
  value: number;
  fullMark: number;
}

export interface SubjectPerformanceRow {
  subject: string;
  color: string;
  completion: number;
  averageScore: number;
}

export interface BloomSubjectProgress {
  subject: string;
  color: string;
  Remember: number;
  Understand: number;
  Apply: number;
  Analyze: number;
}

export type TrendDirection = "up" | "down" | "flat";

export interface PerformanceStat {
  id: string;
  label: string;
  value: string;
  sublabel: string;
  trend: TrendDirection;
  trendValue: string;
  icon: string;
  accent: "primary" | "success" | "warning" | "rose" | "sky";
  sparkline?: number[];
}

// ---------------------------------------------------------------------------
// Weak areas (/weak-areas)
// ---------------------------------------------------------------------------

export interface WeakConcept {
  id: string;
  subject: string;
  subjectColor: string;
  chapter: string;
  topic: string;
  bloomLevel: BloomLevel;
  reason: string;
  wrongAnswers: number;
  totalAttempts: number;
  mastery: number;
  trend: "improving" | "declining" | "stable";
  trendHistory: number[];
  lastPracticed: string;
  relatedPaperId?: string;
  relatedTopicSlug?: string;
  relatedSubjectSlug?: string;
}

// ---------------------------------------------------------------------------
// Calendar (/calendar)
// ---------------------------------------------------------------------------

export type CalendarEventType = "exam" | "assignment" | "revision" | "mock-test" | "study-session";

export interface CalendarEvent {
  id: string;
  date: string; // yyyy-mm-dd
  title: string;
  subject: string;
  type: CalendarEventType;
  time?: string;
  description?: string;
}

// ---------------------------------------------------------------------------
// Study Plan Engine + Exam Planner (/study-plan)
// ---------------------------------------------------------------------------

export type StudyPlanItemKind = "topic" | "revision" | "practice" | "mock-test" | "buffer";

export interface StudyPlanScheduleItem {
  id: string;
  day: number; // day number in the plan (1-indexed)
  date: string;
  kind: StudyPlanItemKind;
  subject: string;
  title: string;
  durationMinutes: number;
  completed?: boolean;
}

export interface StudyPlanInputSummary {
  label: string;
  value: string;
}

export interface ExamPlanInput {
  examName: string;
  examDate: string;
  subject: string;
  chapters: string[];
  weightage: number; // percentage weight of exam in final grade
  priority: "High" | "Medium" | "Low";
  availableHoursPerDay: number;
}

export interface ExamPlanOutput {
  input: ExamPlanInput;
  totalDays: number;
  dailyGoals: { day: number; date: string; goal: string; hours: number }[];
  weeklyGoals: { week: number; goal: string }[];
  revisionSchedule: { date: string; topic: string }[];
  mockTestSchedule: { date: string; title: string }[];
  lastMinutePlan: string[];
}

// ---------------------------------------------------------------------------
// Parent dashboard (/parent)
// ---------------------------------------------------------------------------

export interface ParentRecommendation {
  id: string;
  title: string;
  detail: string;
  priority: "high" | "medium" | "low";
  subject?: string;
}

export interface StudyTimeEntry {
  day: string;
  hours: number;
}

// ---------------------------------------------------------------------------
// Teacher dashboard (/teacher)
// ---------------------------------------------------------------------------

export interface ClassRoom {
  id: string;
  name: string;
  subject: string;
  grade: string;
  studentCount: number;
  avgProgress: number;
  color: string;
}

export interface UploadedMaterial {
  id: string;
  fileName: string;
  subject: string;
  className?: string;
  sizeKb: number;
  uploadedAt: string;
  status: "processing" | "ready" | "error";
  extractedTopics?: string[];
}

export interface ScheduledExam {
  id: string;
  subject: string;
  className: string;
  chapterScope: string;
  date: string;
  maxMarks: number;
}

export interface StudentAnalyticsRow {
  id: string;
  name: string;
  initials: string;
  className: string;
  avgScore: number;
  completion: number;
  weakAreas: string[];
  trend: TrendDirection;
}

export interface ClassWeakConcept {
  topic: string;
  subject: string;
  studentsAffected: number;
  totalStudents: number;
  bloomLevel: BloomLevel;
}

export interface PendingSubmission {
  id: string;
  studentName: string;
  initials: string;
  className: string;
  subject: string;
  examTitle: string;
  submittedAt: string;
  maxMarks: number;
  marksAwarded?: number;
}

// ---------------------------------------------------------------------------
// Admin panel (/admin)
// ---------------------------------------------------------------------------

export type UserRole = "student" | "parent" | "teacher" | "admin";

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  status: "active" | "suspended" | "pending";
  joinedDate: string;
}

export interface AdminSubject {
  id: string;
  name: string;
  board: string;
  grade: string;
  chapterCount: number;
  topicCount: number;
}

export interface PromptTemplate {
  id: string;
  name: string;
  description: string;
  usedFor: string;
  model: string;
  template: string;
  lastEdited: string;
}

export interface LogEntry {
  id: string;
  level: "info" | "warning" | "error";
  message: string;
  source: string;
  time: string;
}

export interface PlatformStat {
  id: string;
  label: string;
  value: string;
  change: string;
  icon: string;
}

// ---------------------------------------------------------------------------
// Gamification extras (/achievements)
// ---------------------------------------------------------------------------

export interface LeaderboardEntry {
  rank: number;
  name: string;
  initials: string;
  color: string;
  xp: number;
  isCurrentUser?: boolean;
}

export interface DailyGoal {
  id: string;
  label: string;
  target: number;
  current: number;
  unit: string;
  xpReward: number;
}
