import { Sparkles, User } from "lucide-react";
import { cn } from "@/lib/utils";

export function RealChatBubble({ role, content, time }: { role: "STUDENT" | "AI"; content: string; time?: string }) {
  const isStudent = role === "STUDENT";
  return (
    <div className={cn("flex items-end gap-2", isStudent ? "flex-row-reverse" : "flex-row")}>
      {isStudent ? (
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-300">
          <User className="h-4 w-4" />
        </div>
      ) : (
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-600 text-white">
          <Sparkles className="h-4 w-4" />
        </div>
      )}
      <div
        className={cn(
          "max-w-[80%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm leading-relaxed sm:max-w-[65%]",
          isStudent
            ? "rounded-br-sm bg-primary-600 text-white"
            : "rounded-bl-sm border border-gray-100 bg-white text-gray-800 dark:border-gray-800 dark:bg-gray-800 dark:text-gray-100"
        )}
      >
        {content}
        {time && <div className={cn("mt-1 text-[10px]", isStudent ? "text-primary-100" : "text-gray-400")}>{time}</div>}
      </div>
    </div>
  );
}
