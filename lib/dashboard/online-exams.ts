// What the dashboard's "Exams & Results" card lists as exams to take. These are the teacher-built ONLINE exams (the Exam records a student can open and attempt), published for the
// student's own school and class, that the student has not started or handed in yet - NOT the dates on the school's academic calendar. Calendar exams (the "Next exam" card and the
// "Coming up" list above it) come from a different source and have no attempt page, so they are never listed here. The words say so, so an empty list is not read as "no exam is coming".
export const ONLINE_EXAMS_HEADING = "Online exams to take";
export const ONLINE_EXAMS_EMPTY = "No online exams to take right now. Exam dates from the school calendar are shown under Next exam and Coming up.";
export const ONLINE_EXAMS_LIMIT = 3;

/** The published online exams this student has no submission for yet, in the order given, at most `limit` of them. */
export function pendingOnlineExams<T extends { submissions: unknown[] }>(exams: T[], limit: number = ONLINE_EXAMS_LIMIT): T[] {
  return exams.filter((e) => e.submissions.length === 0).slice(0, limit);
}
