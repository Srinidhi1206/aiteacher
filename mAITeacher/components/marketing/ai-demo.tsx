import { Bot, User } from "lucide-react";
import { Reveal } from "@/components/marketing/reveal";

const transcript = [
  { role: "student", text: "I don't get why we balance chemical equations. Isn't the formula already correct?" },
  { role: "ai", text: "Great question. What do you think the Law of Conservation of Mass tells us about atoms in a reaction?" },
  { role: "student", text: "That atoms can't be created or destroyed?" },
  { role: "ai", text: "Exactly. So if both sides of the equation must have the same atoms, what happens if the count of Oxygen is different on each side?" },
  { role: "student", text: "Oh - it wouldn't be balanced. We'd need to add coefficients until they match." },
  { role: "ai", text: "That's it. Try balancing H2 + O2 -> H2O yourself now - how many H2 molecules would you need?" },
];

export function AIDemo() {
  return (
    <section id="demo" className="mx-auto max-w-5xl px-4 py-20 sm:px-6 lg:px-8">
      <Reveal className="mx-auto max-w-2xl text-center">
        <h2 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-gray-50 sm:text-4xl">
          See the Socratic method in action
        </h2>
        <p className="mt-4 text-lg text-gray-600 dark:text-gray-300">
          Instead of giving answers away, your AI teacher asks the next question that leads you there yourself.
        </p>
      </Reveal>

      <Reveal delay={0.1} className="mt-12">
        <div className="rounded-3xl border border-gray-100 bg-white p-4 shadow-card dark:border-gray-800 dark:bg-gray-900 sm:p-6">
          <div className="flex items-center gap-2 border-b border-gray-100 pb-4 dark:border-gray-800">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-600 text-white">
              <Bot className="h-4 w-4" />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-50">mAITeacher - Chemistry</p>
              <p className="text-xs text-success-500">Online - Socratic mode</p>
            </div>
          </div>

          <div className="space-y-4 py-5">
            {transcript.map((msg, i) => (
              <div key={i} className={`flex items-start gap-3 ${msg.role === "student" ? "flex-row-reverse" : ""}`}>
                <div
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                    msg.role === "ai"
                      ? "bg-primary-100 text-primary-600 dark:bg-primary-950 dark:text-primary-300"
                      : "bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-300"
                  }`}
                >
                  {msg.role === "ai" ? <Bot className="h-4 w-4" /> : <User className="h-4 w-4" />}
                </div>
                <div
                  className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-sm ${
                    msg.role === "ai"
                      ? "rounded-tl-sm bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-200"
                      : "rounded-tr-sm bg-primary-600 text-white"
                  }`}
                >
                  {msg.text}
                </div>
              </div>
            ))}
          </div>
        </div>
      </Reveal>
    </section>
  );
}
