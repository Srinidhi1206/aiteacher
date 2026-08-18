"use client";
import * as React from "react";
import { cn } from "@/lib/utils";

export interface ProgressProps {
  value: number;
  className?: string;
  barClassName?: string;
  size?: "sm" | "md" | "lg";
}

const sizeClasses = {
  sm: "h-1.5",
  md: "h-2.5",
  lg: "h-4",
};

export function Progress({ value, className, barClassName, size = "md" }: ProgressProps) {
  const clamped = Math.min(100, Math.max(0, value));
  return (
    <div className={cn("w-full overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800", sizeClasses[size], className)}>
      <div
        className={cn("h-full rounded-full bg-primary-500 transition-all duration-500 ease-out", barClassName)}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}
