// Saving a student's exam answers while they are typing, without ever losing one silently.
//
// The server grades an exam from the answers it has SAVED, not from what is on the student's screen. So an answer whose save failed (a dropped connection) or arrived
// out of order (two quick changes to the same question, the older one landing last) would be graded as something the student never meant - with nothing on screen to say so.
// This keeps, per question: the newest value; saves of one question run one after another and a value that has already been replaced is not sent at all; a failed save is
// remembered so it can be shown to the student and sent again (`flush`) before the exam is submitted. Pure of React and of any server code, so it is tested on its own.
export type SaveResult = { ok: boolean; error?: string };
export type SaveFn = (questionId: string, value: string) => Promise<SaveResult>;

export function createAnswerSaver(save: SaveFn, onFailedChange?: (failedQuestionIds: string[]) => void) {
  const latest = new Map<string, string>();
  const chains = new Map<string, Promise<void>>();
  const failed = new Set<string>();
  const announce = () => onFailedChange?.([...failed]);

  function run(questionId: string, value: string): Promise<void> {
    const previous = chains.get(questionId) ?? Promise.resolve();
    const next = previous.then(async () => {
      if (latest.get(questionId) !== value) return; // already replaced by a newer answer, which has its own turn
      let ok = false;
      try {
        ok = (await save(questionId, value)).ok;
      } catch {
        ok = false;
      }
      if (latest.get(questionId) !== value) return; // replaced while it was being saved: the newer answer decides
      if (ok) failed.delete(questionId);
      else failed.add(questionId);
      announce();
    });
    chains.set(questionId, next);
    return next;
  }

  return {
    /** Records the newest answer to a question and saves it (after any save of the same question still running). */
    set(questionId: string, value: string): Promise<void> {
      latest.set(questionId, value);
      return run(questionId, value);
    },
    /** The questions whose newest answer is not known to be saved. */
    failed(): string[] {
      return [...failed];
    },
    /** Waits for everything in flight, then sends every answer that is still unsaved once more. Resolves to the questions that are STILL unsaved. */
    async flush(): Promise<string[]> {
      await Promise.all([...chains.values()]);
      for (const questionId of [...failed]) await run(questionId, latest.get(questionId) as string);
      return [...failed];
    },
  };
}
