"use client";
import * as React from "react";
import { Server } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

const initialSettings = [
  { id: "maintenance", label: "Maintenance mode", description: "Temporarily block student logins for deployments" },
  { id: "signups", label: "Allow new signups", description: "Let new students/parents/teachers register" },
  { id: "ai-tutor", label: "AI Tutor Chat enabled platform-wide", description: "Master switch for the Socratic tutor feature" },
  { id: "leaderboards", label: "Class leaderboards", description: "Enable the optional leaderboard feature for all students" },
];

export function SystemSettingsCard() {
  const [settings, setSettings] = React.useState(
    initialSettings.map((s) => ({ ...s, enabled: s.id !== "maintenance" }))
  );
  const { showToast } = useToast();

  function toggle(id: string) {
    setSettings((prev) => prev.map((s) => (s.id === id ? { ...s, enabled: !s.enabled } : s)));
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Server className="h-4 w-4 text-primary-500" /> System Settings
        </CardTitle>
        <CardDescription className="hidden sm:block">Platform-wide feature flags</CardDescription>
      </CardHeader>
      <CardContent className="space-y-1">
        {settings.map((s) => (
          <div key={s.id} className="flex items-center justify-between gap-3 rounded-xl px-2 py-3">
            <div>
              <p className="text-sm font-medium text-gray-800 dark:text-gray-100">{s.label}</p>
              <p className="text-xs text-gray-400">{s.description}</p>
            </div>
            <Switch checked={s.enabled} onCheckedChange={() => toggle(s.id)} aria-label={s.label} />
          </div>
        ))}
        <div className="flex justify-end pt-2">
          <Button size="sm" onClick={() => showToast("System settings saved", "Changes will apply within a few minutes.")}>
            Save Settings
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
