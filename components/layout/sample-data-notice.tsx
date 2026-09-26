import { FlaskConical } from "lucide-react";

/**
 * Shown on screens whose content is still built-in sample data rather than the
 * signed-in student's real records. Nothing on such a screen is saved or read
 * from the database, so it must not be mistaken for their real progress.
 */
export function SampleDataNotice({ what }: { what?: string }) {
  return (
    <div
      role="note"
      className="mb-4 flex items-start gap-2 rounded-xl border border-warning-200 bg-warning-50 px-3 py-2 text-xs text-warning-800 dark:border-warning-900/50 dark:bg-warning-900/20 dark:text-warning-300"
    >
      <FlaskConical className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <p>
        <span className="font-semibold">Sample data.</span> {what ?? "This screen shows example content and is not connected to your real records yet."}
      </p>
    </div>
  );
}
