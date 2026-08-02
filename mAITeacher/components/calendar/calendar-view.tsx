"use client";
import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CalendarLegend } from "@/components/calendar/legend";
import { DayDetailModal } from "@/components/calendar/day-detail-modal";
import { eventsForDate, eventTypeMeta } from "@/lib/mock-data/calendar";
import { cn } from "@/lib/utils";

const TODAY = "2026-07-19";
const weekdayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function toDateStr(d: Date) {
  return d.toISOString().slice(0, 10);
}

function buildMonthGrid(year: number, month: number): Date[] {
  const firstOfMonth = new Date(year, month, 1);
  const startOffset = firstOfMonth.getDay(); // 0 = Sunday
  const gridStart = new Date(year, month, 1 - startOffset);
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    return d;
  });
}

export function CalendarView() {
  const todayDate = new Date(TODAY);
  const [cursor, setCursor] = React.useState({ year: todayDate.getFullYear(), month: todayDate.getMonth() });
  const [selectedDate, setSelectedDate] = React.useState<string | null>(null);

  const grid = buildMonthGrid(cursor.year, cursor.month);
  const monthLabel = new Date(cursor.year, cursor.month, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });

  function goToMonth(delta: number) {
    setCursor((prev) => {
      const next = new Date(prev.year, prev.month + delta, 1);
      return { year: next.getFullYear(), month: next.getMonth() };
    });
  }

  return (
    <Card className="p-4 sm:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-50">{monthLabel}</h2>
          <div className="flex items-center gap-1">
            <button
              aria-label="Previous month"
              onClick={() => goToMonth(-1)}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              aria-label="Next month"
              onClick={() => goToMonth(1)}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setCursor({ year: todayDate.getFullYear(), month: todayDate.getMonth() })}
        >
          Today
        </Button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold uppercase tracking-wide text-gray-400">
        {weekdayLabels.map((d) => (
          <div key={d} className="py-1">
            {d}
          </div>
        ))}
      </div>

      <div className="mt-1 grid grid-cols-7 gap-1">
        {grid.map((date) => {
          const dateStr = toDateStr(date);
          const isCurrentMonth = date.getMonth() === cursor.month;
          const isToday = dateStr === TODAY;
          const events = eventsForDate(dateStr);

          return (
            <button
              key={dateStr}
              onClick={() => setSelectedDate(dateStr)}
              className={cn(
                "flex min-h-[68px] flex-col items-start gap-1 rounded-xl border p-1.5 text-left transition-colors sm:min-h-[84px] sm:p-2",
                isCurrentMonth
                  ? "border-gray-100 hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-800/60"
                  : "border-transparent opacity-40",
                isToday && "ring-2 ring-primary-500"
              )}
            >
              <span
                className={cn(
                  "flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-semibold",
                  isToday ? "bg-primary-600 text-white" : "text-gray-600 dark:text-gray-300"
                )}
              >
                {date.getDate()}
              </span>
              <div className="flex flex-wrap gap-0.5">
                {events.slice(0, 4).map((e) => (
                  <span key={e.id} className={cn("h-1.5 w-1.5 rounded-full", eventTypeMeta[e.type].dot)} title={e.title} />
                ))}
              </div>
              {events.length > 0 && (
                <span className="hidden truncate text-[10px] text-gray-400 sm:block">
                  {events.length} item{events.length > 1 ? "s" : ""}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="mt-5 border-t border-gray-100 pt-4 dark:border-gray-800">
        <CalendarLegend />
      </div>

      <DayDetailModal date={selectedDate} onClose={() => setSelectedDate(null)} />
    </Card>
  );
}
