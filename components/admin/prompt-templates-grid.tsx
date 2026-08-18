"use client";
import { Wand2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { promptTemplates } from "@/lib/mock-data/admin";
import { formatDate } from "@/lib/utils";

export function PromptTemplatesGrid() {
  const { showToast } = useToast();

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {promptTemplates.map((pt) => (
        <Card key={pt.id}>
          <CardContent className="p-5">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-gray-900 dark:text-gray-50">{pt.name}</p>
                <p className="mt-0.5 text-xs text-gray-400">{pt.usedFor}</p>
              </div>
              <Badge variant="outline">{pt.model}</Badge>
            </div>
            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">{pt.description}</p>
            <pre className="mt-3 max-h-28 overflow-y-auto whitespace-pre-wrap rounded-xl bg-gray-50 p-3 font-mono text-[11px] leading-relaxed text-gray-600 dark:bg-gray-800/60 dark:text-gray-300">
              {pt.template}
            </pre>
            <div className="mt-3 flex items-center justify-between">
              <span className="text-[11px] text-gray-400">Last edited {formatDate(pt.lastEdited)}</span>
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5"
                onClick={() => showToast(`"${pt.name}" saved`, "This is a cosmetic mock editor - no live prompt was changed.")}
              >
                <Wand2 className="h-3.5 w-3.5" /> Edit Template
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
