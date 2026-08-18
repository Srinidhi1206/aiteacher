"use client";
import { MessageSquarePlus, MessageSquareText } from "lucide-react";
import { Conversation } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function ConversationSidebar({
  conversations,
  activeId,
  onSelect,
  onNewChat,
}: {
  conversations: Conversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNewChat: () => void;
}) {
  return (
    <div className="flex h-full flex-col">
      <div className="p-3">
        <Button variant="primary" className="w-full" onClick={onNewChat}>
          <MessageSquarePlus className="h-4 w-4" />
          New chat
        </Button>
      </div>
      <div className="px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-gray-400">Recent conversations</div>
      <div className="flex-1 space-y-1 overflow-y-auto px-2 pb-3">
        {conversations.map((c) => (
          <button
            key={c.id}
            onClick={() => onSelect(c.id)}
            className={cn(
              "flex w-full flex-col items-start gap-0.5 rounded-xl px-3 py-2.5 text-left transition-colors",
              activeId === c.id
                ? "bg-primary-50 dark:bg-primary-950"
                : "hover:bg-gray-50 dark:hover:bg-gray-800"
            )}
          >
            <div className="flex w-full items-center gap-2">
              <MessageSquareText className={cn("h-3.5 w-3.5 shrink-0", activeId === c.id ? "text-primary-600 dark:text-primary-400" : "text-gray-400")} />
              <span className={cn("truncate text-sm font-medium", activeId === c.id ? "text-primary-700 dark:text-primary-300" : "text-gray-700 dark:text-gray-200")}>
                {c.title}
              </span>
            </div>
            <span className="truncate pl-5 text-xs text-gray-400">{c.lastMessage}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
