// Where a Study Plan task should take the student: the exact chapter or topic it is about - but ONLY when that can be worked out reliably. A plan item stores a title and a subject name and
// nothing else (no chapter or topic id), so the link is found by matching the names in the title against the student's own curriculum, and it is made only when the match is unambiguous:
// the subject name is unique in the class, the chapter name is unique in the subject, the topic name is unique in the chapter. Anything uncertain gives no scope (the page's
// "Chapters & materials" link then opens the whole subject, as it always did), never a guess. Once a task IS matched, the matched chapter's database id is what every link carries (a chapter-scoped
// subject page, see chapter-scope.ts), so "Chapters & materials" for "Study: Real Numbers" opens Real Numbers - not all fifteen chapters. Pure, so the Study Plan page and the tests use the same rule.
import { chapterScopeHref } from "./chapter-scope";

export interface LinkChapter {
  id: string;
  name: string;
  topics: { id: string; name: string }[];
}
export interface LinkSubject {
  id: string;
  name: string;
  chapters: LinkChapter[];
}
export interface TaskLink {
  href: string;
  label: string;
}

const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const only = <T>(list: T[]): T | null => (list.length === 1 ? list[0] : null);

/** The anchor of a chapter's card on the subject page. */
export const chapterAnchor = (chapterId: string) => `chapter-${chapterId}`;

/** What a task is about, by database id: the subject, the chapter, and the topic when it is one topic that can be told apart. */
export interface TaskScope {
  subjectId: string;
  chapterId: string;
  topicId: string | null;
}

interface Resolved {
  subject: LinkSubject;
  chapter: LinkChapter;
  topic: { id: string; name: string } | null;
}

function resolveTask(task: { title: string; subject: string }, subjects: LinkSubject[]): Resolved | null {
  const subject = only(subjects.filter((s) => norm(s.name) === norm(task.subject)));
  if (!subject) return null;
  const title = task.title.replace(/ · for .+$/, "").trim(); // "Study: Polynomials · for Unit Test 2" -> "Study: Polynomials"
  const chapterNamed = (name: string) => only(subject.chapters.filter((c) => norm(c.name) === norm(name)));

  // "Review weak topic: Zeroes (Polynomials)": the topic inside that chapter; the chapter itself when the topic cannot be told apart.
  const weak = /^Review weak topic: (.+) \(([^()]+)\)$/.exec(title);
  if (weak) {
    const chapter = chapterNamed(weak[2]);
    if (!chapter) return null;
    return { subject, chapter, topic: only(chapter.topics.filter((t) => norm(t.name) === norm(weak[1]))) };
  }
  // "Study: Polynomials" / "Revise chapter: Polynomials": the chapter.
  const chapterTask = /^(?:Study|Revise chapter): (.+)$/.exec(title);
  if (chapterTask) {
    const chapter = chapterNamed(chapterTask[1]);
    return chapter ? { subject, chapter, topic: null } : null;
  }
  // The general plan's "Review: Zeroes": a topic by name alone - a match only when exactly one topic of the subject has that name.
  const general = /^Review: (.+)$/.exec(title);
  if (general) {
    const hit = only(subject.chapters.flatMap((c) => c.topics.filter((t) => norm(t.name) === norm(general[1])).map((t) => ({ chapter: c, topic: t }))));
    return hit ? { subject, chapter: hit.chapter, topic: hit.topic } : null;
  }
  return null;
}

/** The subject, chapter (and topic) a task is about, or null when that cannot be worked out reliably (a subject-level task, an unknown or ambiguous name): then the task covers the whole subject. */
export function taskScope(task: { title: string; subject: string }, subjects: LinkSubject[]): TaskScope | null {
  const r = resolveTask(task, subjects);
  return r ? { subjectId: r.subject.id, chapterId: r.chapter.id, topicId: r.topic?.id ?? null } : null;
}

/** The task's own page: the topic when it is one topic, otherwise its chapter - the subject page narrowed to that chapter (chapter-scope.ts), never the whole subject. */
export function taskLink(task: { title: string; subject: string }, subjects: LinkSubject[]): TaskLink | null {
  const r = resolveTask(task, subjects);
  if (!r) return null;
  return r.topic ? { href: `/subjects/${r.subject.id}/${r.topic.id}`, label: "Open topic" } : { href: chapterScopeHref(r.subject.id, [r.chapter.id]), label: "Open chapter" };
}
