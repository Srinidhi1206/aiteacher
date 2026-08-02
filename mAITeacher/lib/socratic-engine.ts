import { ChatMessage } from "@/lib/types";

// A small, fully local mock "Socratic response engine". It never returns a
// direct answer — instead it recognizes a handful of demo scenarios (and a
// generic fallback) and returns guiding questions, hints, and encouragement,
// escalating in specificity the more the student keeps asking about the
// same idea within a conversation.

type Category = "photosynthesis" | "quadratic" | "dont-know" | "what-is" | "greeting" | "thanks" | "generic";

function categorize(message: string): Category {
  const m = message.toLowerCase().trim();
  if (/photosynthes/.test(m)) return "photosynthesis";
  if (/quadratic/.test(m)) return "quadratic";
  if (/\b(i don'?t know|idk|no idea|not sure|i'?m stuck|im stuck|i dont understand|i don'?t understand|confused)\b/.test(m)) return "dont-know";
  if (/^(thanks|thank you|thx|ty)\b/.test(m)) return "thanks";
  if (/^(hi|hello|hey|good morning|good afternoon|good evening)\b/.test(m)) return "greeting";
  if (/^(what is|what's|whats|define|explain)\b/.test(m)) return "what-is";
  return "generic";
}

const banks: Record<Exclude<Category, "greeting" | "thanks">, string[]> = {
  photosynthesis: [
    "Good question! Before I explain, tell me — what do you think a plant needs to make its own food? Think about what it takes in from its surroundings.",
    "You're on the right track. Now, where in the plant cell do you think this food-making process actually happens? (Hint: it's named after its green color.)",
    "Nice thinking! So sunlight, water, and carbon dioxide go in — what do you think comes OUT as a product, besides the plant's food (glucose)?",
    "You're close! One of those outputs is something we breathe in every day. Can you name it, and explain why it matters for the whole ecosystem, not just the plant?",
    "Great reasoning so far. Now put it all together: can you write, in your own words, one full sentence describing what photosynthesis is and why it's important?",
    "You've basically worked out photosynthesis yourself! One last push — can you guess why photosynthesis mostly happens during the day and not at night?",
  ],
  quadratic: [
    "Let's build this up together. Do you remember what makes an equation 'quadratic' — what's special about the highest power of x?",
    "Exactly, x². Now, a quadratic ax²+bx+c=0 can be solved a few ways. Which method have you learned — factoring, completing the square, or the quadratic formula?",
    "Good. Let's try factoring first: can you think of two numbers that multiply to give 'c' and add to give 'b' in your equation? Try it with the specific numbers you have.",
    "You're getting there! Once you have those two numbers, how would you rewrite the middle term to split the expression into two groups?",
    "Nice work. Now that it's factored into two brackets, what value of x would make EACH bracket equal to zero?",
    "You've essentially solved it! Can you state both values of x you found, and check by substituting one back into the original equation?",
  ],
  "dont-know": [
    "That's completely okay — not knowing is where all learning starts! Let's break it into a smaller piece. What's the very first word or term in the question that feels unfamiliar to you?",
    "No worries at all. Let's try a different angle: can you tell me what you DO understand about this topic so far, even if it's just one small fact?",
    "Good, that's a start! Now, based on that one fact, what do you think might logically come next?",
    "You're doing better than you think — let's keep going one small step at a time. What happens if we look at a simpler, smaller version of this same problem first?",
    "That's real progress! Now try applying that same idea to the original question — what would you guess the answer might be?",
  ],
  "what-is": [
    "That's a great question to explore rather than just look up! Before I answer, what do you already associate with that term — even a rough guess is a great starting point.",
    "Good attempt! Now, can you think of an example from your textbook or daily life that might relate to this term?",
    "You're building understanding step by step. Based on your example, how would you describe this concept in one simple sentence, in your own words?",
    "That's a solid definition forming! Is there a part of it you're still unsure about — the cause, the effect, or how it's used in problems?",
    "You're almost there. Try comparing this concept to something you already know well — how are they similar or different?",
  ],
  generic: [
    "That's an interesting question! Rather than giving you the answer directly, let's think it through — what part of this do you already feel confident about?",
    "Good — let's dig a little deeper. What information does the question give you, and what exactly is it asking you to find?",
    "You're making progress. Based on what you just said, what would be a reasonable next step to try?",
    "Keep going — you're closer than you think. What happens if you try a small example or a simpler version of this problem first?",
    "Nice effort! Now, using everything we've discussed, what's your best attempt at an answer? Give it a try — it's okay if it's not perfect.",
  ],
};

const wrapUpMessage =
  "You've really worked through this one thoroughly — nice job reasoning it out yourself! Want to try a quick practice question on this, or move on to something new?";

const greetingMessage =
  "Hi there! I'm your AI tutor. I won't just hand you answers — I'll ask questions and give hints so you can work things out yourself. What are you studying today?";

const thanksMessage =
  "You're welcome! Remember, you did the thinking — I just asked the questions. Want to try another topic, or go deeper on this one?";

export function getSocraticResponse(message: string, history: ChatMessage[]): string {
  const category = categorize(message);

  if (category === "greeting") return greetingMessage;
  if (category === "thanks") return thanksMessage;

  const bank = banks[category];
  const priorTurns = history.filter((m) => m.role === "student" && categorize(m.content) === category).length;

  if (priorTurns >= bank.length) return wrapUpMessage;
  return bank[priorTurns];
}
