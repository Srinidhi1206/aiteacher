import { ScheduledExam, UploadedMaterial } from "@/lib/types";

// Foundation-only mock state for Admin > Board Settings / Classes / Study
// Materials / Exam Schedule. Nothing here is persisted server-side yet - see
// docs/ARCHITECTURE.md for the migration path to Postgres + Prisma.

export const defaultBoardType = "CBSE";

export const defaultSupportedClasses = [
  "Class 6",
  "Class 7",
  "Class 8",
  "Class 9",
  "Class 10",
];

export const adminStudyMaterials: UploadedMaterial[] = [
  {
    id: "asm-1",
    fileName: "Class8_Science_Chapter3_Notes.pdf",
    subject: "Science",
    className: "Class 8",
    sizeKb: 1840,
    uploadedAt: "2026-08-01",
    status: "ready",
    extractedTopics: ["Coal and Petroleum", "Combustion and Flame"],
  },
  {
    id: "asm-2",
    fileName: "Class10_Mathematics_Syllabus.pdf",
    subject: "Mathematics",
    className: "Class 10",
    sizeKb: 620,
    uploadedAt: "2026-08-05",
    status: "ready",
  },
];

export const scheduledExams: ScheduledExam[] = [
  {
    id: "exam-1",
    subject: "Mathematics",
    className: "Class 10",
    chapterScope: "Real Numbers, Polynomials",
    date: "2026-09-15",
    maxMarks: 80,
  },
  {
    id: "exam-2",
    subject: "Science",
    className: "Class 8",
    chapterScope: "Chapters 1-3",
    date: "2026-09-20",
    maxMarks: 50,
  },
];
