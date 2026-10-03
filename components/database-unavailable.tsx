import { DatabaseZap } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { RetryButton } from "@/components/retry-button";

/**
 * Shown by any page whose data comes from Prisma when the query throws. Never silently show empty/fake data for a
 * real failure - but also never show a student or an administrator internals: in production the message is plain and
 * offers a retry (a database that is waking up or a dropped connection usually works a moment later). The
 * configuration hint is for developers and only appears outside production.
 */
export function DatabaseUnavailable({ what = "This page" }: { what?: string }) {
  const isDev = process.env.NODE_ENV !== "production";
  return (
    <Card className="flex min-h-[40vh] flex-col items-center justify-center text-center">
      <CardContent className="flex flex-col items-center gap-3 py-12">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-500">
          <DatabaseZap className="h-7 w-7" />
        </div>
        <div>
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-50">We couldn&apos;t load this right now</h2>
          <p className="mt-1 max-w-sm text-sm text-gray-500 dark:text-gray-400">
            {what} couldn&apos;t be loaded. This is usually temporary - please try again in a moment. If it keeps happening, let your school administrator know.
          </p>
          {isDev && (
            <p className="mt-2 max-w-sm text-xs text-gray-400">
              Developer note: check that <code>DATABASE_URL</code> is set and reachable (see docs/DATABASE.md).
            </p>
          )}
        </div>
        <RetryButton />
      </CardContent>
    </Card>
  );
}
