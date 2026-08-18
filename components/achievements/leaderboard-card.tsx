import { Info } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { leaderboard } from "@/lib/mock-data/achievements";
import { cn } from "@/lib/utils";

export function LeaderboardCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Class Leaderboard</CardTitle>
        <Badge variant="outline" className="gap-1">
          <Info className="h-3 w-3" /> Preview feature
        </Badge>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="mb-2 text-xs text-gray-400">
          Optional - ranks students in your section by weekly XP. Visible only to you, and can be turned off in
          Settings.
        </p>
        {leaderboard.map((entry) => (
          <div
            key={entry.rank}
            className={cn(
              "flex items-center gap-3 rounded-xl p-2.5",
              entry.isCurrentUser && "bg-primary-50 dark:bg-primary-950/40"
            )}
          >
            <span className="w-5 shrink-0 text-center text-sm font-bold text-gray-400">{entry.rank}</span>
            <Avatar initials={entry.initials} colorClassName={entry.color} size="sm" />
            <span className="min-w-0 flex-1 truncate text-sm font-medium text-gray-800 dark:text-gray-100">
              {entry.name}
              {entry.isCurrentUser && <span className="ml-1.5 text-xs font-normal text-primary-600 dark:text-primary-400">(You)</span>}
            </span>
            <span className="shrink-0 text-sm font-semibold text-gray-500">{entry.xp.toLocaleString()} XP</span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
