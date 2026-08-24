"use client";
import * as React from "react";
import { WeakConceptCard, type WeakConceptRow } from "@/components/weak-areas/weak-concept-card";

export function WeakAreasList({ concepts }: { concepts: WeakConceptRow[] }) {
  const subjects = React.useMemo(() => [...new Set(concepts.map((c) => c.subject))].sort(), [concepts]);
  const [subjectFilter, setSubjectFilter] = React.useState<string>("All");

  const chapters = React.useMemo(() => {
    const scoped = subjectFilter === "All" ? concepts : concepts.filter((c) => c.subject === subjectFilter);
    return [...new Set(scoped.map((c) => c.chapter))].sort();
  }, [concepts, subjectFilter]);
  const [chapterFilter, setChapterFilter] = React.useState<string>("All");

  React.useEffect(() => setChapterFilter("All"), [subjectFilter]);

  const filtered = concepts.filter(
    (c) => (subjectFilter === "All" || c.subject === subjectFilter) && (chapterFilter === "All" || c.chapter === chapterFilter)
  );

  const bySubject = subjects
    .filter((s) => subjectFilter === "All" || s === subjectFilter)
    .map((subject) => ({ subject, items: filtered.filter((c) => c.subject === subject) }))
    .filter((g) => g.items.length > 0);

  return (
    <div className="space-y-6">
      {subjects.length > 1 && (
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex flex-wrap gap-1.5">
            <FilterButton label="All subjects" active={subjectFilter === "All"} onClick={() => setSubjectFilter("All")} />
            {subjects.map((s) => (
              <FilterButton key={s} label={s} active={subjectFilter === s} onClick={() => setSubjectFilter(s)} />
            ))}
          </div>
          {chapters.length > 1 && (
            <div className="flex flex-wrap gap-1.5">
              <FilterButton label="All chapters" active={chapterFilter === "All"} onClick={() => setChapterFilter("All")} />
              {chapters.map((c) => (
                <FilterButton key={c} label={c} active={chapterFilter === c} onClick={() => setChapterFilter(c)} />
              ))}
            </div>
          )}
        </div>
      )}

      <div className="space-y-8">
        {bySubject.map(({ subject, items }) => (
          <section key={subject}>
            <div className="mb-3 flex items-center gap-2">
              <h2 className="text-base font-semibold text-gray-900 dark:text-gray-50">{subject}</h2>
              <span className="text-xs text-gray-400">
                {items.length} flagged {items.length === 1 ? "topic" : "topics"}
              </span>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {items.map((concept) => (
                <WeakConceptCard key={concept.id} concept={concept} />
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
