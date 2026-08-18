import * as React from "react";
import { cn } from "@/lib/utils";

type BadgeVariant = "default" | "primary" | "success" | "warning" | "danger" | "outline";

const variantClasses: Record<BadgeVariant, string> = {
  default: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  primary: "bg-primary-100 text-primary-700 dark:bg-primary-950 dark:text-primary-300",
  success: "bg-success-100 text-success-700 dark:bg-success-900/40 dark:text-success-400",
  warning: "bg-warning-100 text-warning-700 dark:bg-warning-900/40 dark:text-warning-400",
  danger: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400",
  outline: "border border-gray-200 text-gray-600 dark:border-gray-700 dark:text-gray-300",
};

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

export function Badge({ className, variant = "default", ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium",
        variantClasses[variant],
        className
      )}
      {...props}
    />
  );
}
