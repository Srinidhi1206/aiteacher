import { ClassRoom, UploadedMaterial, StudentAnalyticsRow, ClassWeakConcept } from "@/lib/types";

export const classRooms: ClassRoom[] = [
  { id: "cls-1", name: "Class 11 - Section A", subject: "Mathematics", grade: "Class 11", studentCount: 34, avgProgress: 68, color: "indigo" },
  { id: "cls-2", name: "Class 11 - Section B", subject: "Mathematics", grade: "Class 11", studentCount: 31, avgProgress: 61, color: "indigo" },
  { id: "cls-3", name: "Class 11 - Section A", subject: "Physics", grade: "Class 11", studentCount: 34, avgProgress: 59, color: "sky" },
  { id: "cls-4", name: "Class 10 - Section C", subject: "Chemistry", grade: "Class 10", studentCount: 29, avgProgress: 74, color: "emerald" },
];

export const uploadedMaterials: UploadedMaterial[] = [
  {
    id: "um-1",
    fileName: "Trigonometry_Chapter_Notes.pdf",
    subject: "Mathematics",
    sizeKb: 2380,
    uploadedAt: "2026-07-18",
    status: "ready",
    extractedTopics: ["Trigonometric Ratios", "Trigonometric Identities", "Trigonometric Equations"],
  },
  {
    id: "um-2",
    fileName: "Laws_of_Motion_Slides.pptx",
    subject: "Physics",
    sizeKb: 5210,
    uploadedAt: "2026-07-19",
    status: "processing",
  },
  {
    id: "um-3",
    fileName: "Redox_Reactions_Worksheet.docx",
    subject: "Chemistry",
    sizeKb: 640,
    uploadedAt: "2026-07-17",
    status: "ready",
    extractedTopics: ["Oxidation Numbers", "Balancing Redox Equations"],
  },
  {
    id: "um-4",
    fileName: "Conic_Sections_Scan.pdf",
    subject: "Mathematics",
    sizeKb: 1890,
    uploadedAt: "2026-07-19",
    status: "error",
  },
];

export const studentAnalytics: StudentAnalyticsRow[] = [
  { id: "st-1", name: "Srinidhi Akkenapally", initials: "SA", className: "Class 11 - Section A", avgScore: 78, completion: 67, weakAreas: ["Permutations", "Ellipse & Hyperbola"], trend: "up" },
  { id: "st-2", name: "Ananya Rao", initials: "AR", className: "Class 11 - Section A", avgScore: 86, completion: 82, weakAreas: ["Rotational Motion"], trend: "up" },
  { id: "st-3", name: "Kabir Mehta", initials: "KM", className: "Class 11 - Section A", avgScore: 74, completion: 70, weakAreas: ["Redox Reactions", "Hybridization"], trend: "flat" },
  { id: "st-4", name: "Diya Patel", initials: "DP", className: "Class 11 - Section B", avgScore: 69, completion: 58, weakAreas: ["Trigonometric Equations", "Friction"], trend: "down" },
  { id: "st-5", name: "Arjun Nair", initials: "AN", className: "Class 11 - Section B", avgScore: 81, completion: 75, weakAreas: ["Biomolecules"], trend: "up" },
  { id: "st-6", name: "Meera Iyer", initials: "MI", className: "Class 11 - Section B", avgScore: 63, completion: 52, weakAreas: ["Permutations", "Combinations", "Dimensional Analysis"], trend: "down" },
];

export const classWeakConcepts: ClassWeakConcept[] = [
  { topic: "Permutations", subject: "Mathematics", studentsAffected: 19, totalStudents: 34, bloomLevel: "Apply" },
  { topic: "Ellipse & Hyperbola", subject: "Mathematics", studentsAffected: 22, totalStudents: 34, bloomLevel: "Apply" },
  { topic: "Friction", subject: "Physics", studentsAffected: 17, totalStudents: 34, bloomLevel: "Apply" },
  { topic: "Redox Reactions", subject: "Chemistry", studentsAffected: 14, totalStudents: 29, bloomLevel: "Apply" },
  { topic: "Hybridization", subject: "Chemistry", studentsAffected: 12, totalStudents: 29, bloomLevel: "Understand" },
];
