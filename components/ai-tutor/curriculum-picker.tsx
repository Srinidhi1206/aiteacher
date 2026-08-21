"use client";
// Compact, optional Subject -> Chapter -> Topic selector for the tutor.
// Reuses the existing curriculum read actions (lib/actions/curriculum.ts) -
// no new curriculum queries. Picking a topic starts a new conversation
// with that topic's context attached; the tutor works perfectly well
// without ever touching this (see the empty-state suggested prompts).
import * as React from "react";
import { BookOpen, ChevronDown } from "lucide-react";
import { listSubjectsForClass, listChaptersForSubject } from "@/lib/actions/curriculum";
import { getMyCurriculumScope } from "@/lib/actions/tutor";
import { inputClass } from "@/components/register/field-styles";

type Subject = Awaited<ReturnType<typeof listSubjectsForClass>>[number];
type Chapter = Awaited<ReturnType<typeof listChaptersForSubject>>[number];
type Topic = Chapter["topics"][number];

export function CurriculumPicker({ onPickTopic, disabled }: { onPickTopic: (topicId: string) => void; disabled?: boolean }) {
  const [open, setOpen] = React.useState(false);
  const [schoolClassId, setSchoolClassId] = React.useState<string | null>(null);
  const [subjects, setSubjects] = React.useState<Subject[]>([]);
  const [chapters, setChapters] = React.useState<Chapter[]>([]);
  const [subjectId, setSubjectId] = React.useState("");
  const [chapterId, setChapterId] = React.useState("");
  const [topicId, setTopicId] = React.useState("");
  const [unavailable, setUnavailable] = React.useState(false);

  React.useEffect(() => {
    if (!open || schoolClassId !== null) return;
    getMyCurriculumScope()
      .then((scope) => {
        setSchoolClassId(scope.schoolClassId);
        if (!scope.schoolClassId) {
          setUnavailable(true);
          return;
        }
        return listSubjectsForClass(scope.schoolClassId).then(setSubjects);
      })
      .catch(() => setUnavailable(true));
  }, [open, schoolClassId]);

  React.useEffect(() => {
    setChapterId("");
    setTopicId("");
    setChapters([]);
    if (!subjectId) return;
    listChaptersForSubject(subjectId)
      .then(setChapters)
      .catch(() => setUnavailable(true));
  }, [subjectId]);

  const topics: Topic[] = chapters.find((c) => c.id === chapterId)?.topics ?? [];

  if (unavailable) return null; // no database / no curriculum set up yet - the tutor still works without this

  return (
    <div className="border-t border-gray-100 px-4 py-2.5 text-xs dark:border-gray-800">
      <button onClick={() => setOpen((v) => !v)} className="flex items-center gap-1.5 font-medium text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
        <BookOpen className="h-3.5 w-3.5" /> Ask about a specific topic <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <select className={`${inputClass} !py-1.5 !text-xs`} value={subjectId} onChange={(e) => setSubjectId(e.target.value)} disabled={disabled}>
            <option value="">Subject</option>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          <select className={`${inputClass} !py-1.5 !text-xs`} value={chapterId} onChange={(e) => setChapterId(e.target.value)} disabled={disabled || !subjectId}>
            <option value="">Chapter</option>
            {chapters.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <select className={`${inputClass} !py-1.5 !text-xs`} value={topicId} onChange={(e) => setTopicId(e.target.value)} disabled={disabled || !chapterId}>
            <option value="">Topic</option>
            {topics.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
          <button
            disabled={disabled || !topicId}
            onClick={() => {
              onPickTopic(topicId);
              setOpen(false);
            }}
            className="rounded-full bg-primary-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-700 disabled:opacity-40"
          >
            Start
          </button>
        </div>
      )}
    </div>
  );
}
