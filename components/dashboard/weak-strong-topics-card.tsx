import { TrendingDown, TrendingUp } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { subjects } from "@/lib/mock-data/subjects";

export function WeakStrongTopicsCard() {
  const allWeak = subjects.flatMap((s) => s.weakTopics.map((t) => ({ topic: t, subject: s.name })));
  const allStrong = subjects.flatMap((s) => s.strongTopics.map((t) => ({ topic: t, subject: s.name })));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Weak &amp; Strong Topics</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <div>
            <div className="mb-2 flex items-center gap-1.5 text-warning-600 dark:text-warning-400">
              <TrendingDown className="h-4 w-4" />
              <span className="text-sm font-semibold">Needs Attention</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {allWeak.map((item, i) => (
                <Badge key={i} variant="warning" title={item.subject}>
                  {item.topic}
                </Badge>
              ))}
            </div>
          </div>
          <div>
            <div className="mb-2 flex items-center gap-1.5 text-success-600 dark:text-success-400">
              <TrendingUp className="h-4 w-4" />
              <span className="text-sm font-semibold">Strong Areas</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {allStrong.map((item, i) => (
                <Badge key={i} variant="success" title={item.subject}>
                  {item.topic}
                </Badge>
              ))}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
