"use client";
import * as React from "react";
import { AlertTriangle, Send, Sparkles, RotateCcw } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DatabaseUnavailable } from "@/components/database-unavailable";
import { RealChatBubble } from "./real-chat-bubble";
import { RealConversationSidebar, type ConversationSummary } from "./real-conversation-sidebar";
import { TypingIndicator } from "./typing-indicator";
import { CurriculumPicker } from "./curriculum-picker";
import { createConversation, deleteConversation, getAITutorStatus, getMyConversation, listMyConversations, retryLastReply, sendMessage } from "@/lib/actions/tutor";

interface Message {
  id: string;
  role: "STUDENT" | "AI";
  content: string;
  createdAt: Date | string;
}

const SUGGESTED_PROMPTS = [
  "Explain this topic to me",
  "Help me understand my weak areas",
  "Give me 5 practice questions",
  "Explain this chapter for my class",
  "Help me prepare for my upcoming exam",
];

export function RealTutorView({ initialTopicId, initialPrefill }: { initialTopicId?: string; initialPrefill?: string }) {
  const [status, setStatus] = React.useState<"loading" | "db-unavailable" | "ready">("loading");
  const [aiConfigured, setAiConfigured] = React.useState<boolean | null>(null);
  const [conversations, setConversations] = React.useState<ConversationSummary[]>([]);
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const [messages, setMessages] = React.useState<Message[]>([]);
  const [messagesLoading, setMessagesLoading] = React.useState(false);
  const [input, setInput] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const startedFromTopic = React.useRef(false);
  const scrollRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, sending]);

  const refreshConversations = React.useCallback(async () => {
    const list = await listMyConversations();
    setConversations(list);
    return list;
  }, []);

  const openConversation = React.useCallback(async (id: string) => {
    setMessagesLoading(true);
    setError(null);
    const result = await getMyConversation(id);
    if (!result) {
      // Deleted or never belonged to this student - drop it from the list.
      setConversations((prev) => prev.filter((c) => c.id !== id));
      setActiveId(null);
      setMessages([]);
      setMessagesLoading(false);
      return;
    }
    setActiveId(id);
    setMessages(result.messages);
    setMessagesLoading(false);
  }, []);

  React.useEffect(() => {
    (async () => {
      try {
        const [aiStatus, list] = await Promise.all([getAITutorStatus(), refreshConversations()]);
        setAiConfigured(aiStatus.configured);
        setStatus("ready");

        if (initialTopicId && !startedFromTopic.current) {
          startedFromTopic.current = true;
          const created = await createConversation(initialTopicId);
          if (created.ok && created.data) {
            await refreshConversations();
            await openConversation(created.data.id);
          }
          if (initialPrefill) setInput(initialPrefill);
        } else if (initialPrefill && !startedFromTopic.current) {
          startedFromTopic.current = true;
          setInput(initialPrefill);
          if (list.length > 0) await openConversation(list[0].id);
        } else if (list.length > 0) {
          await openConversation(list[0].id);
        }
      } catch {
        setStatus("db-unavailable");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleNewChat() {
    setError(null);
    const created = await createConversation();
    if (!created.ok || !created.data) {
      setError(created.error ?? "Couldn't start a new conversation.");
      return;
    }
    await refreshConversations();
    setActiveId(created.data.id);
    setMessages([]);
    setInput("");
  }

  async function handleDelete(id: string) {
    const result = await deleteConversation(id);
    if (!result.ok) {
      setError(result.error ?? "Couldn't delete that conversation.");
      return;
    }
    setConversations((prev) => prev.filter((c) => c.id !== id));
    if (activeId === id) {
      setActiveId(null);
      setMessages([]);
    }
  }

  async function submit(text: string) {
    const trimmed = text.trim();
    if (!trimmed || sending) return;

    let conversationId = activeId;
    if (!conversationId) {
      const created = await createConversation();
      if (!created.ok || !created.data) {
        setError(created.error ?? "Couldn't start a new conversation.");
        return;
      }
      conversationId = created.data.id;
      setActiveId(conversationId);
      await refreshConversations();
    }

    setError(null);
    setInput("");
    setSending(true);
    // Optimistic bubble - synced against the real server state below
    // regardless of outcome, so it never lies about what was actually saved.
    setMessages((prev) => [...prev, { id: `pending-${Date.now()}`, role: "STUDENT", content: trimmed, createdAt: new Date() }]);

    const result = await sendMessage(conversationId, trimmed);
    await syncAfterSend(conversationId, result);
  }

  async function handleRetry() {
    if (!activeId || sending) return;
    setError(null);
    setSending(true);
    const result = await retryLastReply(activeId);
    await syncAfterSend(activeId, result);
  }

  async function syncAfterSend(conversationId: string, result: Awaited<ReturnType<typeof sendMessage>>) {
    // Re-fetch from the server rather than guessing locally whether the
    // user message actually persisted (it does for some failure modes -
    // e.g. the AI provider being unreachable - and doesn't for others -
    // e.g. rate limiting, which is checked before anything is saved).
    const fresh = await getMyConversation(conversationId);
    if (fresh) setMessages(fresh.messages);
    setSending(false);
    if (!result.ok) {
      setError(result.error ?? "Something went wrong.");
    } else {
      refreshConversations();
    }
  }

  if (status === "loading") {
    return (
      <Card className="flex h-[calc(100vh-88px)] items-center justify-center text-sm text-gray-400">Loading...</Card>
    );
  }

  if (status === "db-unavailable") {
    return <DatabaseUnavailable what="Tutor data" />;
  }

  const lastMessage = messages[messages.length - 1];
  const canRetry = !sending && !!lastMessage && lastMessage.role === "STUDENT" && !!error;

  return (
    <div className="flex h-[calc(100vh-88px)] gap-4">
      <Card className="hidden w-72 shrink-0 overflow-hidden lg:block">
        <RealConversationSidebar conversations={conversations} activeId={activeId} onSelect={openConversation} onNewChat={handleNewChat} onDelete={handleDelete} />
      </Card>

      <Card className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="flex items-start gap-2 border-b border-gray-100 bg-primary-50/60 p-4 dark:border-gray-800 dark:bg-primary-950/30">
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary-600 dark:text-primary-400" />
          <p className="text-xs text-primary-800 dark:text-primary-300">
            <span className="font-semibold">AI Tutor</span> - explains concepts, gives examples, and offers practice questions tailored to your class and curriculum.
          </p>
        </div>

        {aiConfigured === false && (
          <div className="flex items-center gap-2 border-b border-gray-100 bg-warning-50 px-4 py-2.5 text-xs text-warning-800 dark:border-gray-800 dark:bg-warning-900/20 dark:text-warning-300">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            AI Tutor is not configured yet. Please configure the AI provider to start chatting.
          </div>
        )}

        <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto p-4">
          {messagesLoading ? (
            <p className="py-8 text-center text-sm text-gray-400">Loading conversation...</p>
          ) : messages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
              <Sparkles className="h-8 w-8 text-gray-300 dark:text-gray-600" />
              <p className="max-w-xs text-sm text-gray-500 dark:text-gray-400">Ask anything from your syllabus, or try one of these:</p>
              <div className="flex max-w-md flex-wrap justify-center gap-2">
                {SUGGESTED_PROMPTS.map((p) => (
                  <button
                    key={p}
                    onClick={() => setInput(p)}
                    className="rounded-full border border-gray-200 px-3 py-1.5 text-xs text-gray-600 hover:border-primary-300 hover:text-primary-700 dark:border-gray-700 dark:text-gray-300 dark:hover:border-primary-700 dark:hover:text-primary-300"
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((m) => <RealChatBubble key={m.id} role={m.role} content={m.content} />)
          )}
          {sending && <TypingIndicator />}
        </div>

        {error && (
          <div className="flex items-center justify-between gap-2 border-t border-gray-100 bg-red-50 px-4 py-2 text-xs text-red-700 dark:border-gray-800 dark:bg-red-950/30 dark:text-red-400">
            <span>{error}</span>
            {canRetry && (
              <button onClick={handleRetry} className="flex shrink-0 items-center gap-1 font-medium hover:underline">
                <RotateCcw className="h-3 w-3" /> Retry
              </button>
            )}
          </div>
        )}

        <CurriculumPicker
          disabled={aiConfigured === false}
          onPickTopic={async (topicId) => {
            const created = await createConversation(topicId);
            if (created.ok && created.data) {
              await refreshConversations();
              await openConversation(created.data.id);
            }
          }}
        />

        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit(input);
          }}
          className="flex items-end gap-2 border-t border-gray-100 p-3 dark:border-gray-800"
        >
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit(input);
              }
            }}
            rows={1}
            placeholder={aiConfigured === false ? "AI Tutor is not configured yet..." : "Ask a question about anything in your syllabus..."}
            disabled={sending || aiConfigured === false}
            className="max-h-32 flex-1 resize-none rounded-xl border border-gray-200 bg-transparent px-4 py-2.5 text-sm text-gray-800 outline-none focus:border-primary-400 disabled:opacity-50 dark:border-gray-700 dark:text-gray-100"
          />
          <Button type="submit" size="icon" disabled={!input.trim() || sending || aiConfigured === false}>
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </Card>
    </div>
  );
}
