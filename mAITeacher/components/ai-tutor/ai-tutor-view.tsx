"use client";
import * as React from "react";
import { Lightbulb, Send } from "lucide-react";
import { ChatMessage } from "@/lib/types";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChatBubble } from "@/components/ai-tutor/chat-bubble";
import { TypingIndicator } from "@/components/ai-tutor/typing-indicator";
import { ConversationSidebar } from "@/components/ai-tutor/conversation-sidebar";
import { getSocraticResponse } from "@/lib/socratic-engine";
import { pastConversations, welcomeMessage, suggestedPrompts } from "@/lib/mock-data/ai-tutor";
import { subjects } from "@/lib/mock-data/subjects";

let idCounter = 0;
function nextId(prefix: string) {
  idCounter += 1;
  return `${prefix}-${Date.now()}-${idCounter}`;
}

function timeNow() {
  return new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

export function AiTutorView() {
  const [messages, setMessages] = React.useState<ChatMessage[]>([welcomeMessage]);
  const [input, setInput] = React.useState("");
  const [isTyping, setIsTyping] = React.useState(false);
  const [activeConversation, setActiveConversation] = React.useState<string | null>(null);
  const [subjectFilter, setSubjectFilter] = React.useState<string>("General");
  const scrollRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, isTyping]);

  function sendMessage(text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;

    const studentMessage: ChatMessage = { id: nextId("student"), role: "student", content: trimmed, time: timeNow() };
    const historyForEngine = messages;
    setMessages((prev) => [...prev, studentMessage]);
    setInput("");
    setIsTyping(true);

    const replyText = getSocraticResponse(trimmed, historyForEngine);
    const delay = 700 + Math.min(1200, replyText.length * 8);

    window.setTimeout(() => {
      const aiMessage: ChatMessage = { id: nextId("ai"), role: "ai", content: replyText, time: timeNow() };
      setMessages((prev) => [...prev, aiMessage]);
      setIsTyping(false);
    }, delay);
  }

  function handleNewChat() {
    setMessages([welcomeMessage]);
    setActiveConversation(null);
    setInput("");
  }

  function handleSelectConversation(id: string) {
    const convo = pastConversations.find((c) => c.id === id);
    if (!convo) return;
    setActiveConversation(id);
    setMessages([
      welcomeMessage,
      { id: nextId("student"), role: "student", content: convo.lastMessage.replace(/\.\.\.$/, ""), time: "Earlier" },
      { id: nextId("ai"), role: "ai", content: getSocraticResponse(convo.lastMessage, [welcomeMessage]), time: "Earlier" },
    ]);
  }

  return (
    <div className="flex h-[calc(100vh-88px)] gap-4">
      <Card className="hidden w-72 shrink-0 overflow-hidden lg:block">
        <ConversationSidebar
          conversations={pastConversations}
          activeId={activeConversation}
          onSelect={handleSelectConversation}
          onNewChat={handleNewChat}
        />
      </Card>

      <Card className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="flex items-start gap-2 border-b border-gray-100 bg-primary-50/60 p-4 dark:border-gray-800 dark:bg-primary-950/30">
          <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-primary-600 dark:text-primary-400" />
          <p className="text-xs text-primary-800 dark:text-primary-300">
            <span className="font-semibold">How this works:</span> your AI tutor never just gives you the final answer. It asks guiding
            questions, offers hints, and encourages you to reason through the problem yourself — the way a great human tutor would.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-b border-gray-100 px-4 py-2.5 dark:border-gray-800">
          <span className="text-xs font-medium text-gray-400">Topic:</span>
          {["General", ...subjects.map((s) => s.name)].map((label) => (
            <button
              key={label}
              onClick={() => setSubjectFilter(label)}
              className={
                "rounded-full px-3 py-1 text-xs font-medium transition-colors " +
                (subjectFilter === label
                  ? "bg-primary-600 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700")
              }
            >
              {label}
            </button>
          ))}
        </div>

        <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto p-4">
          {messages.map((m) => (
            <ChatBubble key={m.id} message={m} />
          ))}
          {isTyping && <TypingIndicator />}
        </div>

        {messages.length <= 1 && (
          <div className="flex flex-wrap gap-2 border-t border-gray-100 px-4 py-3 dark:border-gray-800">
            {suggestedPrompts.map((p) => (
              <button
                key={p}
                onClick={() => sendMessage(p)}
                className="rounded-full border border-gray-200 px-3 py-1.5 text-xs text-gray-600 hover:border-primary-300 hover:text-primary-700 dark:border-gray-700 dark:text-gray-300 dark:hover:border-primary-700 dark:hover:text-primary-300"
              >
                {p}
              </button>
            ))}
          </div>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            sendMessage(input);
          }}
          className="flex items-center gap-2 border-t border-gray-100 p-3 dark:border-gray-800"
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask a question about anything in your syllabus..."
            className="flex-1 rounded-xl border border-gray-200 bg-transparent px-4 py-2.5 text-sm text-gray-800 outline-none focus:border-primary-400 dark:border-gray-700 dark:text-gray-100"
          />
          <Button type="submit" size="icon" disabled={!input.trim()}>
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </Card>
    </div>
  );
}
