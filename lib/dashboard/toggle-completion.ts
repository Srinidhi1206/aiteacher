// The logic of ticking a task on the dashboard, kept apart from the React component so it can be tested: the tick shows at once, is put back if the
// save fails OR throws (a server action can throw, for example when the session has expired), the "saving" state is ALWAYS cleared, and the page is
// refreshed only after a successful save so the counts around it update.
export interface ToggleHooks {
  /** The value shown before the click. */
  current: boolean;
  /** Saves the new value; resolves { ok } like a server action, or throws. */
  save: (next: boolean) => Promise<{ ok: boolean }>;
  setCompleted: (value: boolean) => void;
  setPending: (value: boolean) => void;
  /** Called once, after a successful save. */
  onSaved: () => void;
}

export async function toggleCompletion({ current, save, setCompleted, setPending, onSaved }: ToggleHooks): Promise<boolean> {
  const next = !current;
  setPending(true);
  setCompleted(next);
  try {
    const res = await save(next);
    if (!res.ok) {
      setCompleted(current);
      return false;
    }
    onSaved();
    return true;
  } catch {
    setCompleted(current);
    return false;
  } finally {
    setPending(false);
  }
}
