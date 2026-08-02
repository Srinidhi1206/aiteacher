import { ChatMessage, Conversation } from "@/lib/types";

export const pastConversations: Conversation[] = [
  { id: "conv-1", title: "Understanding Photosynthesis", subject: "Biology", lastMessage: "So photosynthesis converts light energy into...", updatedAt: "2026-07-17" },
  { id: "conv-2", title: "Solving Quadratic Equations", subject: "Mathematics", lastMessage: "Let's try factoring the equation together.", updatedAt: "2026-07-16" },
  { id: "conv-3", title: "Newton's Laws Doubt", subject: "Physics", lastMessage: "What happens to the acceleration if mass doubles?", updatedAt: "2026-07-14" },
  { id: "conv-4", title: "Set Theory Basics", subject: "Mathematics", lastMessage: "What's the difference between union and intersection?", updatedAt: "2026-07-10" },
];

export const welcomeMessage: ChatMessage = {
  id: "ai-welcome",
  role: "ai",
  content:
    "Hi Srinidhi! I'm your AI tutor. Ask me anything from your Class 11 syllabus — I'll guide you toward the answer with questions and hints rather than just telling you, so it really sticks. Try asking about photosynthesis, quadratic equations, or anything else you're stuck on.",
  time: "Just now",
};

export const suggestedPrompts: string[] = [
  "Can you explain photosynthesis?",
  "How do I solve a quadratic equation?",
  "What is Newton's Second Law?",
  "I don't know how to start this problem",
];
