import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { adminSubjects } from "@/lib/mock-data/admin";

export function SubjectsTable() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Subjects &amp; Curriculum</CardTitle>
        <CardDescription className="hidden sm:block">Managed content library across boards and grades</CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="w-full min-w-[520px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-left text-xs uppercase tracking-wide text-gray-400 dark:border-gray-800">
              <th className="py-2 pr-3 font-medium">Subject</th>
              <th className="py-2 pr-3 font-medium">Board</th>
              <th className="py-2 pr-3 font-medium">Grade</th>
              <th className="py-2 pr-3 font-medium">Chapters</th>
              <th className="py-2 pr-3 font-medium">Topics</th>
            </tr>
          </thead>
          <tbody>
            {adminSubjects.map((s) => (
              <tr key={s.id} className="border-b border-gray-50 last:border-0 dark:border-gray-800/60">
                <td className="py-2.5 pr-3 font-medium text-gray-800 dark:text-gray-100">{s.name}</td>
                <td className="py-2.5 pr-3 text-gray-500 dark:text-gray-400">{s.board}</td>
                <td className="py-2.5 pr-3 text-gray-500 dark:text-gray-400">{s.grade}</td>
                <td className="py-2.5 pr-3 text-gray-500 dark:text-gray-400">{s.chapterCount}</td>
                <td className="py-2.5 pr-3 text-gray-500 dark:text-gray-400">{s.topicCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
