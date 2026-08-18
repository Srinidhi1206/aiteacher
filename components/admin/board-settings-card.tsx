"use client";
import * as React from "react";
import { Landmark } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { BOARD_TYPES, type BoardType } from "@/lib/classes";
import { defaultBoardType } from "@/lib/mock-data/admin-config";
import { cn } from "@/lib/utils";

export function BoardSettingsCard() {
  const [board, setBoard] = React.useState<BoardType>(defaultBoardType as BoardType);
  const { showToast } = useToast();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Landmark className="h-4 w-4 text-primary-500" /> Board Type
        </CardTitle>
        <CardDescription className="hidden sm:block">
          Choose the board this deployment serves. Drives which curriculum content and exam patterns are used.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-2">
          {BOARD_TYPES.map((b) => (
            <button
              key={b}
              type="button"
              onClick={() => setBoard(b)}
              className={cn(
                "rounded-xl border px-4 py-2.5 text-sm font-medium transition-colors",
                board === b
                  ? "border-primary-500 bg-primary-50 text-primary-700 dark:bg-primary-950 dark:text-primary-300"
                  : "border-gray-200 text-gray-600 hover:border-gray-300 dark:border-gray-700 dark:text-gray-300"
              )}
            >
              {b}
            </button>
          ))}
        </div>
        <div className="mt-4 flex justify-end">
          <Button
            size="sm"
            onClick={() => showToast("Board type saved", `This deployment is now configured for ${board}.`)}
          >
            Save
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
