import Link from "next/link";
import { Clock, FileQuestion, ListChecks, Sparkles } from "lucide-react";
import { Paper } from "@/lib/types";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const difficultyVariant: Record<Paper["difficulty"], "success" | "warning" | "danger" | "default"> = {
  Easy: "success",
  Medium: "warning",
  Hard: "danger",
  Mixed: "default",
};

export function PaperCard({ paper }: { paper: Paper }) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs font-medium text-primary-600 dark:text-primary-400">{paper.subject}</p>
            <h3 className="mt-0.5 truncate text-sm font-semibold text-gray-900 dark:text-gray-50">{paper.title}</h3>
          </div>
          {paper.isCustom && (
            <Badge variant="primary" className="shrink-0">
              <Sparkles className="h-3 w-3" /> Custom
            </Badge>
          )}
        </div>

        <div className="flex flex-wrap gap-1.5">
          {paper.topics.slice(0, 3).map((t) => (
            <Badge key={t} variant="outline">
              {t}
            </Badge>
          ))}
          {paper.topics.length > 3 && <Badge variant="outline">+{paper.topics.length - 3} more</Badge>}
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-gray-500 dark:text-gray-400">
          <span className="flex items-center gap-1">
            <FileQuestion className="h-3.5 w-3.5" /> {paper.questionCount} questions
          </span>
          <span className="flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" /> {paper.durationMinutes} min
          </span>
          <span className="flex items-center gap-1">
            <ListChecks className="h-3.5 w-3.5" /> {paper.totalMarks} marks
          </span>
        </div>

        <div className="flex items-center justify-between pt-1">
          <Badge variant={difficultyVariant[paper.difficulty]}>{paper.difficulty}</Badge>
          <Link
            href={`/practice-papers/${paper.id}/attempt`}
            className="inline-flex h-8 items-center gap-1.5 rounded-xl bg-primary-600 px-3 text-sm font-medium text-white hover:bg-primary-700"
          >
            Start
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
