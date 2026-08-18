import * as React from "react";
import { cn } from "@/lib/utils";

export interface AvatarProps extends React.HTMLAttributes<HTMLDivElement> {
  initials: string;
  colorClassName?: string;
  size?: "sm" | "md" | "lg";
}

const sizeClasses = {
  sm: "h-8 w-8 text-xs",
  md: "h-10 w-10 text-sm",
  lg: "h-14 w-14 text-lg",
};

export function Avatar({ initials, colorClassName = "bg-primary-500", size = "md", className, ...props }: AvatarProps) {
  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full font-semibold text-white",
        sizeClasses[size],
        colorClassName,
        className
      )}
      {...props}
    >
      {initials}
    </div>
  );
}
