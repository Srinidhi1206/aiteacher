import { AlertTriangle } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { classWeakConcepts } from "@/lib/mock-data/teacher";

export function ClassWeakConceptsCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-warning-500" /> Class-wide Weak Concepts
        </CardTitle>
        <CardDescription className="hidden sm:block">Aggregated across all your classes</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {classWeakConcepts.map((wc) => {
          const pct = Math.round((wc.studentsAffected / wc.totalStudents) * 100);
          return (
            <div key={`${wc.subject}-${wc.topic}`} className="rounded-xl border border-gray-100 p-3 dark:border-gray-800">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-medium text-gray-800 dark:text-gray-100">{wc.topic}</p>
                  <p className="text-xs text-gray-400">
                    {wc.subject} - Bloom level: {wc.bloomLevel}
                  </p>
                </div>
                <Badge variant="warning" className="shrink-0">
                  {wc.studentsAffected}/{wc.totalStudents} students
                </Badge>
              </div>
              <Progress value={pct} size="sm" className="mt-2" />
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
