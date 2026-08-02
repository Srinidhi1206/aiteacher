import { BloomLevel } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const bloomBadgeClasses: Record<BloomLevel, string> = {
  Remember: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300",
  Understand: "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300",
  Apply: "bg-primary-100 text-primary-700 dark:bg-primary-950 dark:text-primary-300",
  Analyze: "bg-success-100 text-success-700 dark:bg-success-900/40 dark:text-success-400",
};

export function BloomBadge({ level, className }: { level: BloomLevel; className?: string }) {
  return <Badge className={cn(bloomBadgeClasses[level], className)}>{level}</Badge>;
}

const statusBadgeVariant = {
  weak: "warning",
  developing: "default",
  strong: "success",
} as const;

export function TopicStatusBadge({ status }: { status: "weak" | "developing" | "strong" }) {
  const labels = { weak: "Needs work", developing: "In progress", strong: "Mastered" };
  return <Badge variant={statusBadgeVariant[status]}>{labels[status]}</Badge>;
}
