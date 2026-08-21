import { DatabaseZap } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

/**
 * Shown by any page whose data comes from Prisma when the query throws
 * because there's no live database yet (DATABASE_URL unset/unreachable -
 * the current state of this deployment). Never silently show empty/fake
 * data for a real connection failure - this makes the actual cause visible.
 */
export function DatabaseUnavailable({ what = "This page" }: { what?: string }) {
  return (
    <Card className="flex min-h-[40vh] flex-col items-center justify-center text-center">
      <CardContent className="flex flex-col items-center gap-3 py-12">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-500">
          <DatabaseZap className="h-7 w-7" />
        </div>
        <div>
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-50">Database not connected</h2>
          <p className="mt-1 max-w-sm text-sm text-gray-500 dark:text-gray-400">
            {what} needs a connected database to load real data. Set <code>DATABASE_URL</code> (see docs/DATABASE.md) to enable it.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
