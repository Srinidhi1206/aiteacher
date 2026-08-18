import { Sparkles } from "lucide-react";

export function TypingIndicator() {
  return (
    <div className="flex items-end gap-2">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-600 text-white">
        <Sparkles className="h-4 w-4" />
      </div>
      <div className="flex items-center gap-1 rounded-2xl rounded-bl-sm border border-gray-100 bg-white px-4 py-3 dark:border-gray-800 dark:bg-gray-800">
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-400 [animation-delay:-0.3s]" />
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-400 [animation-delay:-0.15s]" />
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-400" />
      </div>
    </div>
  );
}
