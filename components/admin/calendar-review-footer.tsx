"use client";
// The pinned bottom bar of the calendar-import review screen: the primary "Save ... as drafts" button, the reason when it is disabled, the
// save error, and the secondary actions. It is passed to Modal's `footer`, which keeps it outside the scrolling area - so it is always visible.
// Presentational only (no server calls), so it can be rendered and tested on its own.
import * as React from "react";
import { Loader2, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { SaveButtonState } from "@/lib/calendar-import/review";

export interface CalendarReviewFooterProps {
  button: SaveButtonState;
  saving: boolean;
  selected: number;
  savedCount: number;
  error: string | null;
  onSave: () => void;
  onStartOver: () => void;
  onClose: () => void;
}

export function CalendarReviewFooter({ button, saving, selected, savedCount, error, onSave, onStartOver, onClose }: CalendarReviewFooterProps) {
  const note = button.hint ?? (selected > 0 ? `${selected} selected. They are saved as drafts - students see nothing until you publish them on the calendar.` : "Tick the events you want to save.");
  return (
    <div data-testid="calendar-review-footer" className="space-y-2">
      {error && (
        <p role="alert" data-testid="calendar-review-error" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p id="calendar-review-note" role="status" className="text-xs text-gray-500 dark:text-gray-400">
          {savedCount > 0 ? `${savedCount} saved as draft${savedCount === 1 ? "" : "s"}. ` : ""}
          {note}
        </p>
        <div className="flex shrink-0 flex-wrap justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onStartOver} disabled={saving}>
            Start over
          </Button>
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
            {savedCount > 0 ? "Close" : "Cancel"}
          </Button>
          <Button type="button" data-primary-action="save-drafts" onClick={onSave} disabled={!button.enabled} aria-describedby="calendar-review-note" className="order-first w-full gap-1.5 sm:order-none sm:w-auto">
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />} {button.label}
          </Button>
        </div>
      </div>
    </div>
  );
}
