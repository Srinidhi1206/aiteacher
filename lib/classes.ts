// Centralized class configuration for the K-10 school product surface
// (Admin "Classes" management, Teacher class/subject selection, Student
// assigned class). Import CLASS_OPTIONS/CLASS_VALUES instead of repeating
// "Class 1".."Class 10" string literals across components.
//
// Note: the pre-existing onboarding/subjects flow separately supports a
// broader Class 11/12 + College/University range for the self-serve student
// demo - that is untouched. This module is specifically the Admin-managed
// Class 1-10 range described in the product spec for board/class setup.

export interface ClassOption {
  value: string;
  label: string;
  grade: number;
}

export const CLASS_OPTIONS: ClassOption[] = Array.from({ length: 10 }, (_, i) => {
  const grade = i + 1;
  return { value: `Class ${grade}`, label: `Class ${grade}`, grade };
});

export const CLASS_VALUES: string[] = CLASS_OPTIONS.map((c) => c.value);

export type BoardType = "CBSE" | "ICSE" | "State Board";

export const BOARD_TYPES: BoardType[] = ["CBSE", "ICSE", "State Board"];
