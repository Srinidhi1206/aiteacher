// Runs `work` for a key at most once at a time: a second call with the same key while the first is still running gets the SAME result instead of
// starting a second run. A double click, or a retry that overlaps its predecessor, therefore cannot create anything twice. (Within one server instance;
// the import itself also skips events that already exist, which covers sequential repeats.)
export function dedupeInFlight<T>(inflight: Map<string, Promise<T>>, key: string, work: () => Promise<T>): Promise<T> {
  const running = inflight.get(key);
  if (running) return running;
  const started = work().finally(() => {
    inflight.delete(key);
  });
  inflight.set(key, started);
  return started;
}

/** A stable key for a request payload: the same content gives the same key whatever the order of its object keys. */
export function stableKey(value: unknown): string {
  return JSON.stringify(value, (_k, v) => (v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) : v));
}
