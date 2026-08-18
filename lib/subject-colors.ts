// Shared color-token mapping for subject accent colors, kept in one place so
// every Subjects/Chapters/Topics/Lesson component stays visually consistent
// with the existing dashboard cards (subject-progress-card, topbar, etc).
export const subjectColorClasses: Record<string, { soft: string; text: string; bar: string; border: string }> = {
  indigo: {
    soft: "bg-primary-100 dark:bg-primary-950",
    text: "text-primary-600 dark:text-primary-300",
    bar: "bg-primary-500",
    border: "border-primary-200 dark:border-primary-900",
  },
  sky: {
    soft: "bg-sky-100 dark:bg-sky-950",
    text: "text-sky-600 dark:text-sky-300",
    bar: "bg-sky-500",
    border: "border-sky-200 dark:border-sky-900",
  },
  emerald: {
    soft: "bg-emerald-100 dark:bg-emerald-950",
    text: "text-emerald-600 dark:text-emerald-300",
    bar: "bg-emerald-500",
    border: "border-emerald-200 dark:border-emerald-900",
  },
  rose: {
    soft: "bg-rose-100 dark:bg-rose-950",
    text: "text-rose-600 dark:text-rose-300",
    bar: "bg-rose-500",
    border: "border-rose-200 dark:border-rose-900",
  },
  amber: {
    soft: "bg-amber-100 dark:bg-amber-950",
    text: "text-amber-600 dark:text-amber-300",
    bar: "bg-amber-500",
    border: "border-amber-200 dark:border-amber-900",
  },
};
