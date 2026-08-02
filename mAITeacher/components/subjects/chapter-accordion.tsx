"use client";
import * as React from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { Chapter } from "@/lib/types";
import { Progress } from "@/components/ui/progress";
import { BloomBadge, TopicStatusBadge } from "@/components/subjects/bloom-badge";
import { cn } from "@/lib/utils";

export function ChapterAccordion({
  subjectSlug,
  chapter,
  defaultOpen,
  accentBar,
}: {
  subjectSlug: string;
  chapter: Chapter;
  defaultOpen?: boolean;
  accentBar: string;
}) {
  const [open, setOpen] = React.useState(!!defaultOpen);

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-100 dark:border-gray-800">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-3 bg-white p-4 text-left dark:bg-gray-900"
      >
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-gray-900 dark:text-gray-50">{chapter.name}</p>
          <div className="mt-2 flex items-center gap-2">
            <Progress value={chapter.progress} size="sm" barClassName={accentBar} className="max-w-[160px]" />
            <span className="text-xs font-medium text-gray-400">{chapter.progress}%</span>
            <span className="text-xs text-gray-400">- {chapter.topics.length} topics</span>
          </div>
        </div>
        <ChevronDown className={cn("h-5 w-5 shrink-0 text-gray-400 transition-transform", open && "rotate-180")} />
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeInOut" }}
            className="overflow-hidden bg-gray-50 dark:bg-gray-950/40"
          >
            <div className="divide-y divide-gray-100 dark:divide-gray-800">
              {chapter.topics.map((topic) => (
                <Link
                  key={topic.id}
                  href={`/subjects/${subjectSlug}/${topic.slug}`}
                  className="flex flex-col gap-2 p-4 transition-colors hover:bg-white dark:hover:bg-gray-900 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-gray-800 dark:text-gray-100">{topic.name}</p>
                    <div className="mt-1.5 flex items-center gap-2">
                      <Progress value={topic.mastery} size="sm" barClassName={accentBar} className="max-w-[120px]" />
                      <span className="text-xs text-gray-400">{topic.mastery}% mastery</span>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <BloomBadge level={topic.bloomLevel} />
                    <TopicStatusBadge status={topic.status} />
                  </div>
                </Link>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
