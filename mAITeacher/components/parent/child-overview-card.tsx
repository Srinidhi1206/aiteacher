import { Card, CardContent } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { currentStudent } from "@/lib/mock-data/students";
import { subjects } from "@/lib/mock-data/subjects";

export function ChildOverviewCard() {
  const overall = Math.round(subjects.reduce((sum, s) => sum + s.progress, 0) / subjects.length);

  return (
    <Card className="overflow-hidden">
      <CardContent className="relative p-6">
        <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-primary-100/60 dark:bg-primary-900/20" />
        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <Avatar initials={currentStudent.avatarInitials} colorClassName={currentStudent.avatarColor} size="lg" />
            <div>
              <p className="text-lg font-bold text-gray-900 dark:text-gray-50">{currentStudent.name}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {currentStudent.grade} - {currentStudent.curriculum}
              </p>
              <div className="mt-1.5 flex items-center gap-2">
                <Badge variant="primary">Level {currentStudent.level}</Badge>
                <Badge variant="warning">{currentStudent.streakDays}-day streak</Badge>
              </div>
            </div>
          </div>

          <div className="w-full sm:max-w-xs">
            <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
              <span>Overall Progress</span>
              <span className="font-semibold text-gray-700 dark:text-gray-200">{overall}%</span>
            </div>
            <Progress value={overall} size="lg" className="mt-1.5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
