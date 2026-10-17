// What the Study Plan page tells the student about their plan, besides the tasks themselves. Pure, so it can be tested without a browser or a database.
//   - `advice`: the notes from the plan engine (what stops the school's exam dates reaching the student, how far the exams' subjects and chapters are known, and
//     whether the plan they have is out of date);
//   - the "no graded results yet" note: until the student has finished a graded exam or practice there is no real weak-topic data, so the plan follows textbook
//     order - and the student is told that, rather than being shown something that looks personalised but is not.
export const NO_RESULTS_NOTE = "Your plan follows your textbook order for now. After you finish a graded exam or practice, it will start with the topics you find hardest.";

export function buildPlanPageNotes(input: { advice: string[]; hasPlanItems: boolean; hasWeakAreas: boolean }): string[] {
  const notes = [...input.advice];
  if (input.hasPlanItems && !input.hasWeakAreas) notes.push(NO_RESULTS_NOTE);
  return [...new Set(notes)];
}

/** Subject name -> id, for the "open this subject's chapters and materials" link on each task. Names that two subjects share are left out rather than guessed. */
export function subjectLinkMap(subjects: { id: string; name: string }[]): Record<string, string> {
  const seen = new Map<string, string | null>();
  for (const s of subjects) seen.set(s.name, seen.has(s.name) ? null : s.id);
  return Object.fromEntries([...seen].filter((e): e is [string, string] => e[1] !== null));
}
