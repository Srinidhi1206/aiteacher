// The exam-aware study plan, as PURE scheduling logic: given today's date, the exams the student can see, the class's subjects and chapters, the
// student's weak topics and what is already done, it returns the study items to schedule. No database, no clock, no network and no AI - the same
// inputs always give the same plan, which is what makes it explainable and testable (lib/analytics/learning-path-core.ts loads the inputs and saves
// the result).
//
// What it does, in plain words:
//   - Each upcoming exam gets its own stretch of days: from today (or the day after the previous exam) up to the day before it.
//   - The last few days of that stretch are revision (one short "Revise <subject>" task per subject, weak subjects first); the days before them are
//     study days, with chapters of the exam's subjects in textbook order, one subject after another in turn, weak topics first.
//   - At most MAX_TASKS_PER_DAY tasks a day, so a day stays manageable. If the chapters cannot all fit before the exam, the LAST ones are left out
//     and the notes say how many - the plan never pretends to cover more than the time allows.
//   - Chapters come only from the curriculum tables; nothing is invented. An exam that names no subject or chapters covers the class's subjects in
//     textbook order, and the notes tell the student to check with their teacher which portion the exam covers.
//   - With no upcoming exam it falls back to a general plan (weak topics, then chapters in turn, a revision day every fourth day), and says so.
import { addDays, daysBetween, type ExamItem } from "@/lib/calendar/next-exam";

export const STUDY_MINUTES = 40;
export const REVISION_MINUTES = 30;
export const MAX_TASKS_PER_DAY = 2;
/** Revision tasks are short (30 minutes), so a revision day may hold one more, which lets all of a class's subjects be revised in the last days. */
export const MAX_REVISION_TASKS_PER_DAY = 3;
/** How many days ahead tasks are written. An exam further away than this is still PACED over all its days, only the first ones are saved. */
export const EXAM_HORIZON_DAYS = 28;
export const GENERAL_PLAN_DAYS = 14;

export type PlanKind = "TOPIC" | "REVISION" | "MOCK_TEST";
export type PlanPriority = "HIGH" | "MEDIUM" | "LOW";

export interface PlanSubject {
  id: string;
  name: string;
  /** In textbook order. */
  chapters: { id: string; name: string }[];
}
export interface PlanWeak {
  subjectId: string;
  subjectName: string;
  chapterName: string;
  topicName: string;
  mastery: number;
}
export interface PlanInput {
  /** The student's today, "yyyy-mm-dd". */
  today: string;
  exams: ExamItem[];
  subjects: PlanSubject[];
  weak: PlanWeak[];
  /** Titles of items already done: a chapter done for an exam is not scheduled again for it. */
  completedTitles: Set<string>;
  /** "date|title" of every item that is being kept, so nothing is added twice. */
  existingKeys: Set<string>;
  /** How many kept items each day already has (they use up that day's task allowance). */
  takenByDate: Record<string, number>;
}
export interface PlannedItem {
  date: string;
  kind: PlanKind;
  subject: string;
  title: string;
  durationMinutes: number;
  priority: PlanPriority;
}
export interface PlanResult {
  mode: "exam-aware" | "general";
  items: PlannedItem[];
  notes: string[];
  /** The exams the plan was built around, nearest first. */
  exams: { label: string; startDate: string; daysLeft: number }[];
  /** Chapters that did not fit before their exam. */
  unscheduled: number;
  /**
   * The notes that say how much of the exam's syllabus the plan can vouch for: the exam names only some subjects, names none, or its chapter list could not be read.
   * (Also included in `notes`.) These are the ones worth showing on the Study Plan page itself, because they describe what the plan is based on.
   */
  coverageNotes: string[];
}

const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export const studyTitle = (chapter: string, examLabel: string) => `Study: ${chapter} · for ${examLabel}`;
export const subjectStudyTitle = (subject: string, examLabel: string) => `Study: ${subject} textbook · for ${examLabel}`;
export const weakTitle = (topic: string, chapter: string, examLabel: string) => `Review weak topic: ${topic} (${chapter}) · for ${examLabel}`;
export const reviseTitle = (subject: string, examLabel: string) => `Revise: ${subject} · for ${examLabel}`;

interface Unit {
  subject: string;
  title: string;
  priority: PlanPriority;
}

/**
 * Which subjects an exam covers, each with the chapter scope written for it: the papers the exam is known to have (from the older exam schedules), or the subjects
 * named in its title, or (naming none) all of the class's subjects.
 */
function subjectsFor(exam: ExamItem, subjects: PlanSubject[]): { list: { subject: PlanSubject; scope: string | null }[]; basis: "papers" | "title" | "all" } {
  if (exam.papers.length > 0) {
    const list: { subject: PlanSubject; scope: string | null }[] = [];
    for (const p of exam.papers) {
      const hit = subjects.find((s) => norm(s.name) === norm(p.subjectName));
      // A subject the class does not teach is still the exam's subject - scheduled by name only, with no chapters made up for it.
      const subject = hit ?? { id: `named:${norm(p.subjectName)}`, name: p.subjectName, chapters: [] };
      const have = list.find((x) => x.subject.id === subject.id);
      if (have) have.scope = [have.scope, p.chapterScope].filter(Boolean).join("; ") || null;
      else list.push({ subject, scope: p.chapterScope });
    }
    return { list, basis: "papers" };
  }
  const title = ` ${norm(exam.title)} `;
  const named = subjects.filter((s) => norm(s.name).length >= 3 && title.includes(` ${norm(s.name)} `));
  return named.length ? { list: named.map((subject) => ({ subject, scope: null })), basis: "title" } : { list: subjects.map((subject) => ({ subject, scope: null })), basis: "all" };
}

/** The chapters an exam's free-text scope ("Chapters 1-4", "Real Numbers and Polynomials") points at; all of them when it says nothing usable. */
function scopedChapters(subject: PlanSubject, scope: string | null): { chapters: PlanSubject["chapters"]; understood: boolean } {
  const text = (scope ?? "").trim();
  if (!text) return { chapters: subject.chapters, understood: true };
  const wanted = new Set<number>();
  const n = norm(text);
  subject.chapters.forEach((c, i) => {
    const name = norm(c.name);
    if (name.length >= 3 && n.includes(name)) wanted.add(i);
  });
  for (const m of text.matchAll(/\b(?:ch(?:apters?|\.)?|lessons?|units?)\s*(\d+)\s*(?:-|–|to)\s*(\d+)\b/gi)) {
    const [from, to] = [Number(m[1]), Number(m[2])];
    for (let k = Math.min(from, to); k <= Math.max(from, to); k++) if (k >= 1 && k <= subject.chapters.length) wanted.add(k - 1);
  }
  if (wanted.size === 0) return { chapters: subject.chapters, understood: false };
  return { chapters: subject.chapters.filter((_, i) => wanted.has(i)), understood: true };
}

/** Subjects with weak topics first (weakest first), then by name - so the subjects that need most work come up first in each round. */
function orderSubjects(list: PlanSubject[], weak: PlanWeak[]): PlanSubject[] {
  const worst = (s: PlanSubject) => Math.min(101, ...weak.filter((w) => w.subjectId === s.id).map((w) => w.mastery));
  return [...list].sort((a, b) => worst(a) - worst(b) || a.name.localeCompare(b.name));
}

/** One from each list in turn, so no subject is studied for days on end while the others wait. */
function interleave<T>(lists: T[][]): T[] {
  const out: T[] = [];
  for (let i = 0; lists.some((l) => i < l.length); i++) for (const l of lists) if (i < l.length) out.push(l[i]);
  return out;
}

/** Spreads units evenly over the days that still have room; units beyond the room are dropped from the END of the list. */
function spread(units: Unit[], days: string[], taken: Record<string, number>): { placed: { date: string; unit: Unit }[]; dropped: Unit[] } {
  const room = days.map((d) => ({ d, free: Math.max(0, MAX_TASKS_PER_DAY - (taken[d] ?? 0)) })).filter((x) => x.free > 0);
  const capacity = room.reduce((a, r) => a + r.free, 0);
  const use = units.slice(0, capacity);
  const placed: { date: string; unit: Unit }[] = [];
  let next = 0;
  room.forEach((r, i) => {
    const left = use.length - next;
    const take = Math.min(r.free, Math.ceil(left / (room.length - i)));
    for (let k = 0; k < take; k++) placed.push({ date: r.d, unit: use[next++] });
  });
  return { placed, dropped: units.slice(capacity) };
}

/** How many of a stretch's last days are revision. A single day is all revision; there is no room for study. */
export function revisionDaysFor(available: number): number {
  if (available <= 1) return Math.max(0, available);
  if (available <= 5) return 1;
  if (available <= 8) return 2;
  return 3;
}

/** "Mathematics", "Mathematics and English", "Mathematics, English and Hindi", "Mathematics, English, Hindi and 2 more". */
function nameList(names: string[]): string {
  const uniq = [...new Set(names.map((n) => n.trim()).filter(Boolean))];
  if (uniq.length <= 1) return uniq[0] ?? "";
  if (uniq.length === 2) return `${uniq[0]} and ${uniq[1]}`;
  if (uniq.length === 3) return `${uniq[0]}, ${uniq[1]} and ${uniq[2]}`;
  return `${uniq[0]}, ${uniq[1]}, ${uniq[2]} and ${uniq.length - 3} more`;
}

function planForExam(input: PlanInput, exam: ExamItem, winStart: string, notes: string[], coverage: string[]): { items: PlannedItem[]; unscheduled: number } {
  const cover = (text: string) => {
    notes.push(text);
    coverage.push(text);
  };
  const winEnd = addDays(exam.startDate, -1);
  const available = daysBetween(winStart, winEnd) + 1;
  if (available <= 0) {
    notes.push(`There are no days left to prepare for ${exam.label}.`);
    return { items: [], unscheduled: 0 };
  }
  const { list, basis } = subjectsFor(exam, input.subjects);
  const scopeById = new Map(list.map((x) => [x.subject.id, x.scope]));
  const subjects = orderSubjects(list.map((x) => x.subject), input.weak);
  if (subjects.length === 0) {
    notes.push(`No subjects are set up for your class, so ${exam.label} could not be planned.`);
    return { items: [], unscheduled: 0 };
  }
  if (basis === "all" && exam.source === "calendar") {
    cover(`${exam.label}: the calendar does not say which subjects or chapters it covers, so the plan follows your chapters in textbook order. Check with your teacher which portion it covers.`);
  } else if (basis === "papers" || basis === "title") {
    // The exam names only some subjects. The note is shown only when a subject the class studies is NOT among them - if every known subject is represented there is
    // nothing to caution about. Nothing is assumed about the subjects not named: the student is told to ask.
    const covered = new Set(list.map((x) => x.subject.id));
    const missing = input.subjects.filter((s) => !covered.has(s.id));
    if (missing.length > 0) {
      const names = nameList(list.map((x) => x.subject.name));
      cover(
        basis === "papers"
          ? `Your plan for ${exam.label} is based on the published papers for ${names}. Check with your teacher whether other subjects are included.`
          : `Your plan for ${exam.label} covers ${names}, named in the exam's title. Check with your teacher whether other subjects are included.`
      );
    }
  }

  // Study units: weak topics first (weakest first), then the chapters, one subject after another in turn.
  const subjectIds = new Set(subjects.map((s) => s.id));
  const weakHere = input.weak.filter((w) => subjectIds.has(w.subjectId)).sort((a, b) => a.mastery - b.mastery || a.topicName.localeCompare(b.topicName));
  const weakChapters = new Set(weakHere.map((w) => `${w.subjectId}|${norm(w.chapterName)}`));
  const units: Unit[] = weakHere.map((w) => ({ subject: w.subjectName, title: weakTitle(w.topicName, w.chapterName, exam.label), priority: "HIGH" as const }));
  const chapterless = subjects.filter((s) => s.chapters.length === 0 && !s.id.startsWith("named:")).map((s) => s.name);
  if (chapterless.length > 0) cover(`${exam.label}: no chapter list is set up yet for ${nameList(chapterless)}, so ${chapterless.length === 1 ? "it appears" : "each appears"} as one general task.`);
  const perSubject = subjects.map((s) => {
    if (s.chapters.length === 0) return [{ subject: s.name, title: subjectStudyTitle(s.name, exam.label), priority: "MEDIUM" as PlanPriority }];
    const scope = scopeById.get(s.id) ?? null;
    const { chapters, understood } = scopedChapters(s, scope);
    if (!understood) cover(`${exam.label}: the chapter list "${scope}" could not be matched to your ${s.name} chapters, so all of them are planned.`);
    return chapters.map((c) => ({ subject: s.name, title: studyTitle(c.name, exam.label), priority: (weakChapters.has(`${s.id}|${norm(c.name)}`) ? "HIGH" : "MEDIUM") as PlanPriority }));
  });
  const todo = [...units, ...interleave(perSubject)].filter((u) => !input.completedTitles.has(u.title));

  const revDays = revisionDaysFor(available);
  const studyDayCount = available - revDays;
  const days = (from: number, count: number) => Array.from({ length: count }, (_, i) => addDays(winStart, from + i));
  const placed: { date: string; unit: Unit; kind: PlanKind; minutes: number }[] = [];

  const study = spread(todo, days(0, studyDayCount), input.takenByDate);
  study.placed.forEach((p) => placed.push({ ...p, kind: "TOPIC", minutes: STUDY_MINUTES }));
  if (study.dropped.length > 0 && studyDayCount > 0) {
    const chaptersLeft = study.dropped.filter((u) => !u.title.startsWith("Review weak topic")).length;
    notes.push(`Only ${todo.length - study.dropped.length} of ${todo.length} study tasks fit before ${exam.label}; ${plural(chaptersLeft, "chapter")} had to be left out. Start earlier or ask your teacher what to prioritise.`);
  }
  if (available <= 2) notes.push(`Only ${plural(available, "day")} left before ${exam.label}, so the plan is revision only.`);

  // Revision: one short task per subject, rotated over the revision days (weak subjects first).
  const revStart = studyDayCount;
  let r = 0;
  for (let i = 0; i < revDays; i++) {
    const date = addDays(winStart, revStart + i);
    const free = Math.max(0, MAX_REVISION_TASKS_PER_DAY - (input.takenByDate[date] ?? 0));
    const left = subjects.length - r;
    const take = Math.min(free, Math.ceil(Math.max(left, 0) / (revDays - i)));
    for (let k = 0; k < take; k++) {
      const s = subjects[r % subjects.length];
      r++;
      placed.push({ date, unit: { subject: s.name, title: reviseTitle(s.name, exam.label), priority: input.weak.some((w) => w.subjectId === s.id) ? "HIGH" : "MEDIUM" }, kind: "REVISION", minutes: REVISION_MINUTES });
    }
  }
  if (revDays > 0 && r < subjects.length) notes.push(`${exam.label}: there is only time to revise ${r} of your ${subjects.length} subjects.`);

  return {
    items: placed.map((p) => ({
      date: p.date,
      kind: p.kind,
      subject: p.unit.subject,
      title: p.unit.title,
      durationMinutes: p.minutes,
      priority: p.unit.priority === "HIGH" || daysBetween(p.date, exam.startDate) <= 7 ? "HIGH" : "MEDIUM",
    })),
    unscheduled: study.dropped.filter((u) => !u.title.startsWith("Review weak topic")).length,
  };
}

function generalPlan(input: PlanInput, blockedUntil: string | null): PlannedItem[] {
  const subjects = orderSubjects(input.subjects, input.weak);
  const subjectIds = new Set(subjects.map((s) => s.id));
  const queue: Unit[] = input.weak
    .filter((w) => subjectIds.has(w.subjectId))
    .sort((a, b) => a.mastery - b.mastery)
    .map((w) => ({ subject: w.subjectName, title: `Review: ${w.topicName}`, priority: "HIGH" as const }));
  const perSubject = subjects.map((s) =>
    s.chapters.length === 0 ? [{ subject: s.name, title: `${s.name}: continue current chapter`, priority: "MEDIUM" as PlanPriority }] : s.chapters.map((c) => ({ subject: s.name, title: `Study: ${c.name}`, priority: "MEDIUM" as PlanPriority }))
  );
  queue.push(...interleave(perSubject));
  // No subjects and no weak topics: there is nothing real to plan, so no revision days are made up either.
  if (queue.length === 0) return [];
  const todo = queue.filter((u) => !input.completedTitles.has(u.title));

  const items: PlannedItem[] = [];
  let at = 0;
  for (let day = 1; day <= GENERAL_PLAN_DAYS; day++) {
    const date = addDays(input.today, day - 1);
    if (blockedUntil && date <= blockedUntil) continue; // an exam is being written that day
    if ((input.takenByDate[date] ?? 0) >= MAX_TASKS_PER_DAY) continue;
    if (day % 4 === 0) {
      const mock = day % 8 === 0;
      items.push({ date, kind: mock ? "MOCK_TEST" : "REVISION", subject: "All subjects", title: mock ? "Mock test - mixed topics" : "Revision - recap this week's topics", durationMinutes: REVISION_MINUTES, priority: "MEDIUM" });
      continue;
    }
    if (todo.length === 0) continue;
    const u = todo[at % todo.length];
    at++;
    items.push({ date, kind: "TOPIC", subject: u.subject, title: u.title, durationMinutes: STUDY_MINUTES, priority: u.priority });
  }
  return items;
}

/** What the student's own record says about whether their school's exam dates can reach them at all. Nothing is guessed: each note names what is missing. */
export function placementNotes(student: { schoolId: string | null; boardId: string | null; schoolClassId: string | null }): string[] {
  if (!student.schoolClassId) return ["Your class has not been set up yet, so no study plan can be built. Ask your school administrator to place you in a class."];
  if (!student.schoolId) {
    return ["You haven't been placed in a school yet, so your school's exam dates, assignments and materials can't reach you. This plan follows your class chapters; it becomes exam-aware once you are placed and your school publishes exam dates."];
  }
  if (!student.boardId) return ["Your account has no board set, so your school's calendar can't be matched to you. Ask your school administrator to fix your profile."];
  return [];
}

/** The chapter and subject names the class has NOW, as the plan was just built from them. */
export interface KnownCurriculum {
  chapters: Iterable<string>;
  subjects: Iterable<string>;
}

const STUDY_TASK = /^Study: (.+?)(?: · for .+)?$/;

/** Labels of the exams (as the plan now sees them) that have unfinished tasks "for" them dated on or after the exam's first day. Dates are "yyyy-mm-dd". */
export function examsWithLateTasks(tasks: { title: string; date: string }[], exams: { label: string; startDate: string }[]): string[] {
  const out: string[] = [];
  for (const exam of exams) {
    if (tasks.some((t) => EXAM_SUFFIX.exec(t.title)?.[1] === exam.label && t.date >= exam.startDate)) out.push(exam.label);
  }
  return out;
}

/**
 * Names that "Study: <name>" tasks of an existing plan point at but the curriculum no longer has. Task titles are all a plan stores about a chapter (there is no link to the
 * chapter row), so a chapter that was deleted or renamed leaves its old task in every plan made before. Subject-level tasks ("Study: <subject> textbook") are matched against
 * the subjects, and tasks that are not chapter tasks at all (revision, mock tests, weak-topic reviews) are never reported.
 */
export function removedChapterNames(existingFutureTitles: string[], known: KnownCurriculum): string[] {
  const chapters = new Set([...known.chapters].map(norm));
  const subjects = new Set([...known.subjects].map(norm));
  const gone = new Map<string, string>();
  for (const title of existingFutureTitles) {
    const name = STUDY_TASK.exec(title)?.[1];
    if (!name || chapters.has(norm(name))) continue;
    const asSubject = name.replace(/ textbook$/i, "");
    if (asSubject !== name && subjects.has(norm(asSubject))) continue;
    gone.set(norm(name), name);
  }
  return [...gone.values()];
}

const EXAM_SUFFIX = / · for (.+)$/;
const examLabelsIn = (titles: string[]) => new Set(titles.map((t) => EXAM_SUFFIX.exec(t)?.[1]).filter((x): x is string => Boolean(x)));

/**
 * Whether the plan the student already has no longer matches what a fresh plan would be built around - and why, in words. Only the things that matter are compared
 * (which exams the tasks are for, whether tasks are left, whether the plan still has the old generic placeholders): a plan is never called out of date just because a
 * day has passed. `existingFutureTitles` are the unfinished tasks dated today or later; `hasPlan` is whether the student has any plan at all (no plan: the page already
 * offers to create one). Returns null when the plan is fine.
 */
export function planStaleReason(existingFutureTitles: string[], hasPlan: boolean, result: PlanResult, known?: KnownCurriculum, datedTasks?: { title: string; date: string }[]): string | null {
  if (!hasPlan) return null;
  const have = examLabelsIn(existingFutureTitles);
  const wanted = examLabelsIn(result.items.map((i) => i.title));
  const missing = [...wanted].filter((l) => !have.has(l));
  if (missing.length > 0) return `it does not include ${nameList(missing)} yet.`;
  const gone = [...have].filter((l) => !wanted.has(l));
  if (gone.length > 0) return `it still plans for ${nameList(gone)}, which is no longer an upcoming published exam.`;
  // An exam whose date moved EARLIER leaves tasks "for" it on or after the day it now starts - plainly wrong, whatever the label. (An exam moved later is not reported: the
  // plan still prepares for it, only earlier than needed.) Only checked when the caller passes the tasks with their dates.
  const late = datedTasks ? examsWithLateTasks(datedTasks, result.exams) : [];
  if (late.length > 0) return `the date of ${nameList(late)} has changed, and some of ${late.length === 1 ? "its" : "their"} tasks are now planned on or after ${late.length === 1 ? "it" : "them"}.`;
  // A task for a chapter the class no longer has (deleted, renamed, or a placeholder removed): only checked when the caller says what the curriculum is now.
  const removed = known ? removedChapterNames(existingFutureTitles, known) : [];
  if (removed.length > 0) return `it still has tasks for ${nameList(removed)}, which ${removed.length === 1 ? "is" : "are"} no longer in your syllabus.`;
  // A plan made long before an exam only wrote its first days; the revision days at the very end were beyond what it could write then. Once those days are within reach, a fresh plan
  // has revision tasks "for" the exam that this plan lacks - the student would otherwise reach the exam with no revision planned, and nothing would say so.
  const haveTitles = new Set(existingFutureTitles);
  const needRevision = [...new Set(result.items.filter((i) => i.kind === "REVISION" && /^Revise: /.test(i.title) && !haveTitles.has(i.title)).map((i) => EXAM_SUFFIX.exec(i.title)?.[1]).filter((x): x is string => Boolean(x)))];
  if (needRevision.length > 0) return `it does not include the revision days for ${nameList(needRevision)} yet.`;
  if (existingFutureTitles.some((t) => /: continue current chapter$/.test(t)) && result.items.some((i) => /^Study: /.test(i.title))) {
    return "it was made before chapter-level planning, so it still has general placeholder tasks.";
  }
  if (existingFutureTitles.length === 0 && result.items.length > 0) return "it has no tasks left for the coming days.";
  return null;
}

export const staleMessage = (reason: string) => `Your study plan is out of date: ${reason} Press "Generate my learning path" to update it - completed and past tasks are kept.`;

export function buildStudyPlan(input: PlanInput): PlanResult {
  const notes: string[] = [];
  const coverage: string[] = [];
  const upcoming = input.exams.filter((e) => e.startDate > input.today).sort((a, b) => a.startDate.localeCompare(b.startDate) || a.label.localeCompare(b.label));
  const examSummary = upcoming.slice(0, 3).map((e) => ({ label: e.label, startDate: e.startDate, daysLeft: daysBetween(input.today, e.startDate) }));

  // Days on which an exam is being written (it started on or before today and has not finished) are not study days: preparation resumes the day after.
  const running = input.exams.filter((e) => e.startDate <= input.today && (e.endDate ?? e.startDate) >= input.today);
  const blockedUntil = running.reduce<string | null>((m, e) => {
    const end = e.endDate ?? e.startDate;
    return m === null || end > m ? end : m;
  }, null);

  let items: PlannedItem[];
  let unscheduled = 0;
  let mode: PlanResult["mode"];
  if (upcoming.length === 0) {
    mode = "general";
    items = generalPlan(input, blockedUntil);
    const chapterless = input.subjects.filter((s) => s.chapters.length === 0).map((s) => s.name);
    if (chapterless.length > 0) {
      const text = `No chapter list is set up yet for ${nameList(chapterless)}, so ${chapterless.length === 1 ? "it appears" : "each appears"} as one general task.`;
      notes.push(text);
      coverage.push(text);
    }
    notes.push("No upcoming exam dates are published for your class yet, so this is a general plan from your chapters. It becomes exam-aware once your school publishes exam dates.");
  } else {
    mode = "exam-aware";
    items = [];
    const horizonEnd = addDays(input.today, EXAM_HORIZON_DAYS - 1);
    let winStart = blockedUntil ? addDays(blockedUntil, 1) : input.today;
    for (const exam of upcoming) {
      // An exam whose preparation stretch only begins after the days being written is planned later, when the plan is regenerated - and says nothing yet.
      if (winStart > horizonEnd) break;
      const res = planForExam(input, exam, winStart, notes, coverage);
      items.push(...res.items);
      unscheduled += res.unscheduled;
      // The next exam's stretch starts the day after this one finishes.
      winStart = addDays(exam.endDate && exam.endDate > exam.startDate ? exam.endDate : exam.startDate, 1);
    }
    items = items.filter((i) => i.date <= horizonEnd);
  }

  // Nothing already kept is added a second time.
  const seen = new Set(input.existingKeys);
  items = items
    .filter((i) => {
      const key = `${i.date}|${i.title}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => a.date.localeCompare(b.date));
  return { mode, items, notes: [...new Set(notes)], exams: examSummary, unscheduled, coverageNotes: [...new Set(coverage)] };
}
