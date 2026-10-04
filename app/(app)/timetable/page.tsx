// The student's timetable: the PUBLISHED timetable of their own school and class (their section's, if they are in one), as set
// up by their school administrator. Shows only what the server returns for this student - nothing from another school or class.
import { Clock } from "lucide-react";
import { Topbar } from "@/components/layout/topbar";
import { Card, CardContent } from "@/components/ui/card";
import { DatabaseUnavailable } from "@/components/database-unavailable";
import { WeekGrid } from "@/components/timetable/week-grid";
import { getMyTimetable } from "@/lib/actions/timetable";
import { getMyAccount } from "@/lib/actions/account";

export default async function TimetablePage() {
  let timetable: Awaited<ReturnType<typeof getMyTimetable>>;
  try {
    timetable = await getMyTimetable();
  } catch {
    return (
      <>
        <Topbar title="Timetable" />
        <main className="flex-1 p-4 sm:p-6">
          <DatabaseUnavailable what="Your timetable" />
        </main>
      </>
    );
  }

  if (!timetable) {
    // Two different reasons for an empty page: not placed in a school yet, or the school has not published one.
    const account = await getMyAccount().catch(() => null);
    const unplaced = account?.role === "student" && !account.schoolName;
    return (
      <>
        <Topbar title="Timetable" />
        <main className="flex-1 p-4 sm:p-6">
          <Card className="flex min-h-[50vh] flex-col items-center justify-center text-center">
            <CardContent className="flex flex-col items-center gap-4 py-16">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary-50 text-primary-600 dark:bg-primary-950 dark:text-primary-300">
                <Clock className="h-8 w-8" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-50">{unplaced ? "You haven't been placed in a school yet" : "No timetable yet"}</h2>
                <p className="mt-2 max-w-md text-sm text-gray-500 dark:text-gray-400">
                  {unplaced
                    ? "Your school administrator will add you to your school soon. Once they do, your class timetable will appear here."
                    : "Your school hasn't published a timetable for your class yet. Check back soon, or ask your teacher."}
                </p>
              </div>
            </CardContent>
          </Card>
        </main>
      </>
    );
  }

  return (
    <>
      <Topbar title="Timetable" />
      <main className="flex-1 space-y-4 p-4 sm:p-6">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-50">
            {timetable.title || `${timetable.className}${timetable.section ? ` ${timetable.section}` : ""} timetable`}
          </h2>
          <p className="text-xs text-gray-400">
            {timetable.className}
            {timetable.section ? ` - Section ${timetable.section}` : ""}
            {timetable.academicYear ? ` - ${timetable.academicYear}` : ""}
          </p>
        </div>
        <WeekGrid entries={timetable.entries} highlightToday />
      </main>
    </>
  );
}
