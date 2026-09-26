"use client";
// Pick a real topic from the student's own curriculum (their class's subjects
// -> chapters -> topics, all from the database via student-curriculum.ts) and
// start practicing it. Recent attempts come from the real Attempt table.
import * as React from "react";
import Link from "next/link";
import { PenLine } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { inputClass, labelClass } from "@/components/register/field-styles";
import { formatDate } from "@/lib/utils";
import { StartPracticeButton } from "@/components/practice/start-practice-button";
import { getMySubject, type MySubjectSummary, type MySubjectDetail } from "@/lib/actions/student-curriculum";

interface HistoryRow {
  paperId: string;
  title: string;
  score: number;
  total: number;
  at: Date;
}

export function PracticeLauncher({ subjects, history }: { subjects: MySubjectSummary[]; history: HistoryRow[] }) {
  const practicable = subjects.filter((s) => s.topicCount > 0);
  const [subjectId, setSubjectId] = React.useState("");
  const [detail, setDetail] = React.useState<MySubjectDetail | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [chapterId, setChapterId] = React.useState("");
  const [topicId, setTopicId] = React.useState("");

  React.useEffect(() => {
    setDetail(null);
    setChapterId("");
    setTopicId("");
    if (!subjectId) return;
    setLoading(true);
    getMySubject(subjectId)
      .then(setDetail)
      .finally(() => setLoading(false));
  }, [subjectId]);

  React.useEffect(() => setTopicId(""), [chapterId]);

  const chapter = detail?.chapters.find((c) => c.id === chapterId);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <PenLine className="h-4 w-4 text-primary-500" /> Practice a topic
          </CardTitle>
          <CardDescription className="hidden sm:block">5 multiple-choice questions on a topic from your own class. Your score updates your progress.</CardDescription>
        </CardHeader>
        <CardContent>
          {practicable.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Your class doesn&apos;t have any chapters and topics set up yet, so there is nothing to practice. Ask your school administrator.
            </p>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                  <label className={labelClass} htmlFor="practice-subject">Subject</label>
                  <select id="practice-subject" className={inputClass} value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
                    <option value="">Select</option>
                    {practicable.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelClass} htmlFor="practice-chapter">Chapter</label>
                  <select id="practice-chapter" className={inputClass} value={chapterId} onChange={(e) => setChapterId(e.target.value)} disabled={!detail}>
                    <option value="">{loading ? "Loading..." : "Select"}</option>
                    {detail?.chapters.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelClass} htmlFor="practice-topic">Topic</label>
                  <select id="practice-topic" className={inputClass} value={topicId} onChange={(e) => setTopicId(e.target.value)} disabled={!chapter}>
                    <option value="">Select</option>
                    {chapter?.topics.map((t) => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              {topicId ? <StartPracticeButton topicId={topicId} label="Start practice" /> : <p className="text-xs text-gray-400">Choose a subject, chapter and topic to begin.</p>}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent practice</CardTitle>
        </CardHeader>
        <CardContent>
          {history.length === 0 ? (
            <p className="py-4 text-center text-sm text-gray-400">You haven&apos;t completed any practice yet.</p>
          ) : (
            <ul className="divide-y divide-gray-100 dark:divide-gray-800">
              {history.map((h) => (
                <li key={`${h.paperId}-${String(h.at)}`}>
                  <Link href={`/practice-papers/${h.paperId}/results`} className="flex items-center justify-between gap-3 py-2.5 text-sm hover:text-primary-700 dark:hover:text-primary-300">
                    <span className="min-w-0 flex-1 truncate text-gray-800 dark:text-gray-100">{h.title}</span>
                    <span className="shrink-0 text-xs text-gray-400">{formatDate(h.at)}</span>
                    <span className="shrink-0 font-semibold text-gray-700 dark:text-gray-200">
                      {h.score}/{h.total}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
