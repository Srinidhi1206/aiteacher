import { Library, FileText, Download, ExternalLink } from "lucide-react";
import { Topbar } from "@/components/layout/topbar";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DatabaseUnavailable } from "@/components/database-unavailable";
import { listMaterialsForStudent } from "@/lib/actions/materials";

const materialTypeLabel: Record<string, string> = {
  TEXTBOOK: "Textbook",
  NOTES: "Notes",
  REFERENCE: "Reference",
  VIDEO: "Video",
  PDF: "PDF",
  PRESENTATION: "Presentation",
  OTHER: "Other",
};

export default async function MaterialsPage() {
  let materials: Awaited<ReturnType<typeof listMaterialsForStudent>>;
  try {
    materials = await listMaterialsForStudent();
  } catch {
    return (
      <>
        <Topbar title="Study Materials" />
        <main className="flex-1 p-4 sm:p-6">
          <DatabaseUnavailable what="Study materials" />
        </main>
      </>
    );
  }

  const bySubject = new Map<string, typeof materials>();
  for (const m of materials) {
    const key = m.subject.name;
    if (!bySubject.has(key)) bySubject.set(key, []);
    bySubject.get(key)!.push(m);
  }

  return (
    <>
      <Topbar title="Study Materials" />
      <main className="flex-1 space-y-6 p-4 sm:p-6">
        {materials.length === 0 ? (
          <Card className="flex min-h-[50vh] flex-col items-center justify-center text-center">
            <CardContent className="flex flex-col items-center gap-4 py-16">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary-50 text-primary-600 dark:bg-primary-950 dark:text-primary-300">
                <Library className="h-8 w-8" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-50">No study materials yet</h2>
                <p className="mt-2 max-w-md text-sm text-gray-500 dark:text-gray-400">
                  Your teachers and admin haven&apos;t published any materials for your class yet. Check back soon, or ask your
                  teacher.
                </p>
              </div>
            </CardContent>
          </Card>
        ) : (
          [...bySubject.entries()].map(([subjectName, items]) => (
            <Card key={subjectName}>
              <CardHeader>
                <CardTitle>{subjectName}</CardTitle>
                <CardDescription className="hidden sm:block">{items.length} materials</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {items.map((m) => (
                  <div
                    key={m.id}
                    className="flex flex-col gap-2 rounded-xl border border-gray-100 p-3 dark:border-gray-800 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex items-start gap-2.5">
                      <FileText className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                      <div>
                        <p className="text-sm font-medium text-gray-800 dark:text-gray-100">{m.title}</p>
                        <p className="text-xs text-gray-400">
                          {m.chapter.name}
                          {m.topic ? ` - ${m.topic.name}` : ""} - {(m.sizeKb / 1024).toFixed(1)} MB
                        </p>
                        {m.description && <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{m.description}</p>}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Badge variant="primary">{materialTypeLabel[m.materialType] ?? m.materialType}</Badge>
                      <a
                        href={m.fileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                      >
                        <ExternalLink className="h-3.5 w-3.5" /> Open
                      </a>
                      <a
                        href={m.fileUrl}
                        download
                        className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                      >
                        <Download className="h-3.5 w-3.5" /> Download
                      </a>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          ))
        )}
      </main>
    </>
  );
}
