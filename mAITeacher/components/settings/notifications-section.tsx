"use client";
import * as React from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";

const initialPrefs = [
  { id: "reminders", label: "Study reminders", description: "Daily nudges for your scheduled tasks", enabled: true },
  { id: "grades", label: "Grades & feedback", description: "When an assignment or test is graded", enabled: true },
  { id: "streaks", label: "Streak alerts", description: "Reminders before your streak resets", enabled: true },
  { id: "exams", label: "Exam countdowns", description: "Updates as upcoming exams get closer", enabled: true },
  { id: "achievements", label: "Achievements", description: "New badges and level-ups", enabled: true },
  { id: "parent-digest", label: "Weekly parent digest", description: "Send a progress summary to your linked parent account", enabled: false },
  { id: "leaderboard", label: "Leaderboard updates", description: "Weekly rank changes among classmates", enabled: false },
];

export function NotificationsSection() {
  const [prefs, setPrefs] = React.useState(initialPrefs);

  function toggle(id: string) {
    setPrefs((prev) => prev.map((p) => (p.id === id ? { ...p, enabled: !p.enabled } : p)));
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Notification Preferences</CardTitle>
        <CardDescription className="hidden sm:block">Choose what mAITeacher notifies you about</CardDescription>
      </CardHeader>
      <CardContent className="space-y-1">
        {prefs.map((p) => (
          <div key={p.id} className="flex items-center justify-between gap-3 rounded-xl px-2 py-3">
            <div>
              <p className="text-sm font-medium text-gray-800 dark:text-gray-100">{p.label}</p>
              <p className="text-xs text-gray-400">{p.description}</p>
            </div>
            <Switch checked={p.enabled} onCheckedChange={() => toggle(p.id)} aria-label={p.label} />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
