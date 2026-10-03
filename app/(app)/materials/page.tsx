import { Library, UserX } from "lucide-react";
import { Topbar } from "@/components/layout/topbar";
import { Card, CardContent } from "@/components/ui/card";
import { DatabaseUnavailable } from "@/components/database-unavailable";
import { MaterialsBrowser } from "@/components/materials/materials-browser";
import { listMaterialsForStudent } from "@/lib/actions/materials";
import { getMyAccount } from "@/lib/actions/account";

export default async function MaterialsPage() {
  let materials: Awaited<ReturnType<typeof listMaterialsForStudent>>;
  try {
    materials = await listMaterialsForStudent();
  } catch {
    return (
      <>
        <Topbar title="Study Materials" />
        <main className="flex-1 p-4 sm:p-6">
          <DatabaseUnavailable what="Your study materials" />
        </main>
      </>
    );
  }

  // An empty list means two different things to the student: they have not been placed in a school yet (nothing school-owned
  // can reach them until an administrator does that), or their class simply has nothing published. Say which.
  const account = materials.length === 0 ? await getMyAccount().catch(() => null) : null;
  const unplaced = account?.role === "student" && !account.schoolName;

  return (
    <>
      <Topbar title="Study Materials" />
      <main className="flex-1 space-y-6 p-4 sm:p-6">
        {materials.length === 0 ? (
          <Card className="flex min-h-[50vh] flex-col items-center justify-center text-center">
            <CardContent className="flex flex-col items-center gap-4 py-16">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary-50 text-primary-600 dark:bg-primary-950 dark:text-primary-300">
                {unplaced ? <UserX className="h-8 w-8" /> : <Library className="h-8 w-8" />}
              </div>
              <div>
                <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-50">{unplaced ? "You haven't been placed in a school yet" : "No study materials yet"}</h2>
                <p className="mt-2 max-w-md text-sm text-gray-500 dark:text-gray-400">
                  {unplaced
                    ? "Your school administrator will add you to your school soon. Once they do, the study materials published for your class will appear here."
                    : "No study materials have been published for your class yet. Check back soon, or ask your teacher."}
                </p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <MaterialsBrowser
            materials={materials.map((m) => ({
              id: m.id,
              title: m.title,
              description: m.description,
              fileUrl: m.fileUrl,
              materialType: m.materialType,
              subjectName: m.subject.name,
              chapterName: m.chapter?.name ?? null,
              topicName: m.topic?.name ?? null,
              sizeKb: m.sizeKb,
            }))}
          />
        )}
      </main>
    </>
  );
}
