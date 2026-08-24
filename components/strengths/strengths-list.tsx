"use client";
import * as React from "react";
import { StrengthCard, type StrengthRow } from "@/components/strengths/strength-card";

export function StrengthsList({ strengths }: { strengths: StrengthRow[] }) {
  const subjects = React.useMemo(() => [...new Set(strengths.map((s) => s.subject))].sort(), [strengths]);
  const [subjectFilter, setSubjectFilter] = React.useState<string>("All");

  const filtered = subjectFilter === "All" ? strengths : strengths.filter((s) => s.subject === subjectFilter);

  const bySubject = subjects
    .filter((s) => subjectFilter === "All" || s === subjectFilter)
    .map((subject) => ({ subject, items: filtered.filter((s) => s.subject === subject) }))
    .filter((g) => g.items.length > 0);

  return (
    <div className="space-y-6">
      {subjects.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          <FilterButton label="All subjects" active={subjectFilter === "All"} onClick={() => setSubjectFilter("All")} />
          {subjects.map((s) => (
            <FilterButton key={s} label={s} active={subjectFilter === s} onClick={() => setSubjectFilter(s)} />
          ))}
        </div>
      )}

      <div className="space-y-8">
        {bySubject.map(({ subject, items }) => (
          <section key={subject}>
            <div className="mb-3 flex items-center gap-2">
              <h2 className="text-base font-semibold text-gray-900 dark:text-gray-50">{subject}</h2>
              <span className="text-xs text-gray-400">
                {items.length} strong {items.length === 1 ? "topic" : "topics"}
              </span>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {items.map((strength) => (
                <StrengthCard key={strength.id} strength={strength} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

function FilterButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
        active ? "bg-primary-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300"
      }`}
    >
      {label}
    </button>
  );
}
