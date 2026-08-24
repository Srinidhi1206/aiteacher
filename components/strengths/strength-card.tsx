import Link from "next/link";
import { Sparkles } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { MiniTrend } from "@/components/weak-areas/mini-trend";
import { formatDate } from "@/lib/utils";

export interface StrengthRow {
  id: string;
  topicId: string;
  topic: string;
  chapter: string;
  subject: string;
  mastery: number;
  reason: string;
  trend: "IMPROVING" | "DECLINING" | "STABLE";
  trendHistory: number[];
  lastPracticed: Date | string;
}

function maintenanceTip(strength: StrengthRow): string {
  if (strength.trend === "DECLINING") return "Mastery has started slipping - a quick refresher would help keep this strong.";
  if (strength.mastery >= 90) return "This is a strong area - try a harder practice set or help explain it to reinforce it further.";
  return "Solid work - a light periodic review will help this stay strong.";
}

export function StrengthCard({ strength }: { strength: StrengthRow }) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-xs text-gray-400">
              {strength.subject} - {strength.chapter}
            </p>
            <p className="text-sm font-semibold text-gray-900 dark:text-gray-50">{strength.topic}</p>
          </div>
          <Badge variant="success">{strength.mastery}%</Badge>
        </div>

        <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">{strength.reason}</p>

        <div className="mt-3 flex items-center justify-between text-xs text-gray-400">
          <span>Last practiced {formatDate(strength.lastPracticed)}</span>
          <MiniTrend trend={strength.trend} trendHistory={strength.trendHistory} />
        </div>

        <div className="mt-2 flex items-center gap-2">
          <Progress value={strength.mastery} size="sm" className="flex-1" />
          <span className="text-xs font-semibold text-gray-500">{strength.mastery}%</span>
        </div>

        <p className="mt-3 rounded-lg bg-gray-50 p-2 text-xs text-gray-600 dark:bg-gray-800/60 dark:text-gray-300">
          {maintenanceTip(strength)}
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            href={`/ai-tutor?topicId=${strength.topicId}&prefill=${encodeURIComponent(
              `I'm strong in ${strength.topic}. Give me a harder practice question to push further.`
            )}`}
            className="inline-flex h-8 items-center gap-1.5 rounded-xl bg-primary-600 px-3 text-sm font-medium text-white transition-colors hover:bg-primary-700"
          >
            <Sparkles className="h-3.5 w-3.5" /> Ask Tutor
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
