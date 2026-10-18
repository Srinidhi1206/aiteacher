// A tiny evaluator for the subset of Prisma `where` filters the calendar and study-plan code uses (equality, null, AND / OR, gte / lte / gt / lt /
// not / in, and nested relation filters), so offline tests can run the REAL scope rules (lib/calendar/scope.ts) against in-memory rows instead of
// re-implementing them. Not a general Prisma emulator: an operator it does not know throws, so a test can never pass by silently matching nothing.
const OPS = ["gte", "lte", "gt", "lt", "not", "in", "equals"];
type Row = Record<string, unknown>;

const cmp = (a: unknown, b: unknown): number => {
  const x = a instanceof Date ? a.getTime() : (a as number | string);
  const y = b instanceof Date ? b.getTime() : (b as number | string);
  return x < y ? -1 : x > y ? 1 : 0;
};
const same = (a: unknown, b: unknown) => (a instanceof Date && b instanceof Date ? a.getTime() === b.getTime() : a === b);

export function matches(row: Row, where: unknown): boolean {
  if (where === undefined || where === null) return true;
  for (const [key, cond] of Object.entries(where as Row)) {
    if (cond === undefined) continue; // Prisma ignores undefined filters
    if (key === "AND") {
      if (!(Array.isArray(cond) ? cond : [cond]).every((c) => matches(row, c))) return false;
      continue;
    }
    if (key === "OR") {
      if (!(cond as unknown[]).some((c) => matches(row, c))) return false;
      continue;
    }
    if (key === "NOT") throw new Error("fake-where: NOT is not supported");
    const value = row[key];
    if (cond === null) {
      if (value !== null && value !== undefined) return false;
    } else if (cond instanceof Date || typeof cond !== "object") {
      if (!same(value, cond)) return false;
    } else {
      const c = cond as Row;
      const keys = Object.keys(c);
      if (keys.length === 1 && keys[0] === "some") {
        // a to-many relation filter: at least one related row matches
        if (!Array.isArray(value) || !value.some((v) => matches(v as Row, c.some))) return false;
        continue;
      }
      if (keys.some((k) => OPS.includes(k))) {
        for (const k of keys) {
          if (!OPS.includes(k)) throw new Error(`fake-where: unknown operator ${k}`);
          if (k === "gte" && !(value != null && cmp(value, c[k]) >= 0)) return false;
          if (k === "lte" && !(value != null && cmp(value, c[k]) <= 0)) return false;
          if (k === "gt" && !(value != null && cmp(value, c[k]) > 0)) return false;
          if (k === "lt" && !(value != null && cmp(value, c[k]) < 0)) return false;
          if (k === "equals" && !same(value, c[k])) return false;
          if (k === "in" && !(c[k] as unknown[]).some((x) => same(value, x))) return false;
          if (k === "not") {
            if (c[k] === null ? value == null : same(value, c[k])) return false;
          }
        }
      } else if (value === null || value === undefined || typeof value !== "object" || !matches(value as Row, c)) {
        return false; // a nested relation filter
      }
    }
  }
  return true;
}
