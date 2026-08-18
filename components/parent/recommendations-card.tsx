import { Sparkles } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { parentRecommendations } from "@/lib/mock-data/parent";

const priorityVariant = {
  high: "danger",
  medium: "warning",
  low: "success",
} as const;

export function RecommendationsCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary-500" /> AI Recommendations for You
        </CardTitle>
        <CardDescription className="hidden sm:block">Generated from Srinidhi&apos;s recent activity</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {parentRecommendations.map((r) => (
          <div key={r.id} className="rounded-xl border border-gray-100 p-3 dark:border-gray-800">
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-medium text-gray-800 dark:text-gray-100">{r.title}</p>
              <Badge variant={priorityVariant[r.priority]} className="shrink-0 capitalize">
                {r.priority}
              </Badge>
            </div>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{r.detail}</p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
