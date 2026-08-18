import { Formula } from "@/lib/types";

export function FormulaCard({ formula }: { formula: Formula }) {
  return (
    <div className="rounded-2xl border border-primary-100 bg-primary-50/60 p-4 dark:border-primary-900 dark:bg-primary-950/30">
      <p className="text-xs font-semibold uppercase tracking-wide text-primary-600 dark:text-primary-400">{formula.name}</p>
      <p className="mt-2 overflow-x-auto whitespace-pre text-lg font-semibold text-gray-900 dark:text-gray-50">{formula.expression}</p>
      <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">{formula.description}</p>
    </div>
  );
}
