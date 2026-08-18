"use client";
import { useTheme } from "next-themes";
import * as React from "react";
import { Sun, Moon, Monitor } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const options = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
];

export function AppearanceSection() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Appearance</CardTitle>
        <CardDescription className="hidden sm:block">Choose how mAITeacher looks on this device</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 gap-3">
          {options.map((opt) => {
            const Icon = opt.icon;
            const isActive = mounted && theme === opt.value;
            return (
              <button
                key={opt.value}
                onClick={() => setTheme(opt.value)}
                className={cn(
                  "flex flex-col items-center gap-2 rounded-xl border p-4 text-sm font-medium transition-colors",
                  isActive
                    ? "border-primary-400 bg-primary-50 text-primary-700 dark:bg-primary-950 dark:text-primary-300"
                    : "border-gray-200 text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                )}
              >
                <Icon className="h-5 w-5" />
                {opt.label}
              </button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
