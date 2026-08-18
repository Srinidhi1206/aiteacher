"use client";
import * as React from "react";
import { Layers } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { CLASS_OPTIONS } from "@/lib/classes";
import { defaultSupportedClasses } from "@/lib/mock-data/admin-config";
import { cn } from "@/lib/utils";

export function ClassesManagerCard() {
  const [enabled, setEnabled] = React.useState<Set<string>>(new Set(defaultSupportedClasses));
  const { showToast } = useToast();

  function toggle(value: string) {
    setEnabled((prev) => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Layers className="h-4 w-4 text-primary-500" /> Classes
        </CardTitle>
        <CardDescription className="hidden sm:block">
          Turn on the classes this deployment currently supports (Class 1-10).
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {CLASS_OPTIONS.map((c) => {
            const isOn = enabled.has(c.value);
            return (
              <button
                key={c.value}
                type="button"
                onClick={() => toggle(c.value)}
                className={cn(
                  "rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors",
                  isOn
                    ? "border-primary-500 bg-primary-50 text-primary-700 dark:bg-primary-950 dark:text-primary-300"
                    : "border-gray-200 text-gray-400 hover:border-gray-300 dark:border-gray-700 dark:text-gray-500"
                )}
              >
                {c.label}
              </button>
            );
          })}
        </div>
        <div className="mt-4 flex items-center justify-between">
          <p className="text-xs text-gray-400">{enabled.size} of {CLASS_OPTIONS.length} classes enabled</p>
          <Button
            size="sm"
            onClick={() => showToast("Classes updated", `${enabled.size} classes are now active on this deployment.`)}
          >
            Save
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
