"use client";
import { Sparkles } from "lucide-react";
import { ChatMessage } from "@/lib/types";
import { Avatar } from "@/components/ui/avatar";
import { useSessionUser } from "@/components/layout/session-user-context";
import { cn } from "@/lib/utils";

export function ChatBubble({ message }: { message: ChatMessage }) {
  const user = useSessionUser();
  const isStudent = message.role === "student";

  return (
    <div className={cn("flex items-end gap-2", isStudent ? "flex-row-reverse" : "flex-row")}>
      {isStudent ? (
        <Avatar initials={user ? user.name.slice(0, 2).toUpperCase() : "?"} colorClassName="bg-primary-500" size="sm" />
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
        {message.content}
        <div className={cn("mt-1 text-[10px]", isStudent ? "text-primary-100" : "text-gray-400")}>{message.time}</div>
      </div>
    </div>
  );
}
