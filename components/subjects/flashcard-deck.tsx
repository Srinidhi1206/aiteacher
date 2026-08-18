"use client";
import * as React from "react";
import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight, RotateCcw } from "lucide-react";
import { Flashcard } from "@/lib/types";
import { Button } from "@/components/ui/button";

export function FlashcardDeck({ cards }: { cards: Flashcard[] }) {
  const [index, setIndex] = React.useState(0);
  const [flipped, setFlipped] = React.useState(false);

  if (cards.length === 0) return null;
  const card = cards[index];

  function go(delta: number) {
    setFlipped(false);
    setIndex((i) => (i + delta + cards.length) % cards.length);
  }

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="w-full max-w-md [perspective:1200px]">
        <motion.div
          onClick={() => setFlipped((f) => !f)}
          className="relative h-56 w-full cursor-pointer [transform-style:preserve-3d]"
          animate={{ rotateY: flipped ? 180 : 0 }}
          transition={{ duration: 0.45 }}
        >
          <div className="absolute inset-0 flex flex-col items-center justify-center rounded-2xl border border-gray-100 bg-white p-6 text-center shadow-soft [backface-visibility:hidden] dark:border-gray-800 dark:bg-gray-900">
            <span className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-primary-500">Question</span>
            <p className="text-base font-medium text-gray-900 dark:text-gray-50">{card.front}</p>
            <span className="mt-4 text-xs text-gray-400">Tap to flip</span>
          </div>
          <div
            className="absolute inset-0 flex flex-col items-center justify-center rounded-2xl border border-primary-100 bg-primary-50 p-6 text-center shadow-soft [backface-visibility:hidden] dark:border-primary-900 dark:bg-primary-950"
            style={{ transform: "rotateY(180deg)" }}
          >
            <span className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-primary-600 dark:text-primary-300">Answer</span>
            <p className="text-sm font-medium text-primary-900 dark:text-primary-100">{card.back}</p>
          </div>
        </motion.div>
      </div>

      <div className="flex items-center gap-3">
        <Button variant="outline" size="icon" onClick={() => go(-1)} aria-label="Previous card">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setFlipped((f) => !f)}>
          <RotateCcw className="h-3.5 w-3.5" /> Flip
        </Button>
        <span className="text-xs text-gray-400">
          {index + 1} / {cards.length}
        </span>
        <Button variant="outline" size="icon" onClick={() => go(1)} aria-label="Next card">
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
