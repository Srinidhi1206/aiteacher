import { Topbar } from "@/components/layout/topbar";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { XpLevelCard } from "@/components/achievements/xp-level-card";
import { BadgeGrid } from "@/components/achievements/badge-grid";
import { StreakCalendar } from "@/components/achievements/streak-calendar";
import { DailyGoalsCard } from "@/components/achievements/daily-goals-card";
import { LeaderboardCard } from "@/components/achievements/leaderboard-card";

export default function AchievementsPage() {
  return (
    <>
      <Topbar title="Achievements" />
      <main className="flex-1 space-y-6 p-4 sm:p-6">
        <XpLevelCard />

        <Card>
          <CardHeader>
            <CardTitle>Badges</CardTitle>
          </CardHeader>
          <CardContent>
            <BadgeGrid />
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-6">
            <StreakCalendar />
            <LeaderboardCard />
          </div>
          <DailyGoalsCard />
        </div>
      </main>
    </>
  );
}
