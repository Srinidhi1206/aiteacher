"use client";
import * as React from "react";
import { MessageSquarePlus, MessageSquareText, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDate, cn } from "@/lib/utils";

export interface ConversationSummary {
  id: string;
  title: string;
  subject: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export function RealConversationSidebar({
  conversations,
  activeId,
  onSelect,
  onNewChat,
  onDelete,
}: {
  conversations: ConversationSummary[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNewChat: () => void;
  onDelete: (id: string) => void;
}) {
  const [confirmingId, setConfirmingId] = React.useState<string | null>(null);

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
        {conversations.length === 0 && <p className="px-3 py-4 text-xs text-gray-400">No conversations yet.</p>}
        {conversations.map((c) => (
          <div
            key={c.id}
            className={cn(
              "group flex w-full items-start gap-1 rounded-xl px-1 py-1 transition-colors",
              activeId === c.id ? "bg-primary-50 dark:bg-primary-950" : "hover:bg-gray-50 dark:hover:bg-gray-800"
            )}
          >
            <button onClick={() => onSelect(c.id)} className="flex min-w-0 flex-1 flex-col items-start gap-0.5 px-2 py-1.5 text-left">
              <div className="flex w-full items-center gap-2">
                <MessageSquareText className={cn("h-3.5 w-3.5 shrink-0", activeId === c.id ? "text-primary-600 dark:text-primary-400" : "text-gray-400")} />
                <span className={cn("truncate text-sm font-medium", activeId === c.id ? "text-primary-700 dark:text-primary-300" : "text-gray-700 dark:text-gray-200")}>
                  {c.title}
                </span>
              </div>
              <span className="truncate pl-5 text-xs text-gray-400">{formatDate(c.updatedAt)}</span>
            </button>
            {confirmingId === c.id ? (
              <div className="flex shrink-0 items-center gap-1 py-1.5 pr-1">
                <button
                  onClick={() => {
                    setConfirmingId(null);
                    onDelete(c.id);
                  }}
                  className="rounded-lg px-1.5 py-1 text-[11px] font-semibold text-red-600 hover:bg-red-50 dark:hover:bg-red-950"
                >
                  Delete
                </button>
                <button onClick={() => setConfirmingId(null)} className="rounded-lg px-1.5 py-1 text-[11px] text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800">
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmingId(c.id)}
                aria-label={`Delete conversation "${c.title}"`}
                className="mt-1.5 shrink-0 rounded-lg p-1.5 text-gray-300 opacity-0 hover:bg-gray-100 hover:text-red-500 group-hover:opacity-100 dark:hover:bg-gray-800"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
