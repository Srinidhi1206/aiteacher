"use client";
import { useRouter } from "next/navigation";
import { FileEdit, Download } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

export function CreateExamsCard() {
  const { showToast } = useToast();
  const router = useRouter();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileEdit className="h-4 w-4 text-primary-500" /> Create Exams
        </CardTitle>
        <CardDescription className="hidden sm:block">Build a class exam using the same generator students use for practice</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Pick a subject, chapters, question count and Bloom distribution - the AI question engine generates a
          ready-to-assign exam in seconds.
        </p>
        <div className="flex shrink-0 gap-2">
          <Button size="sm" onClick={() => router.push("/practice-papers")}>
            Open Exam Builder
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5"
            onClick={() => showToast("Report exported", "The class performance report has been downloaded as a PDF.")}
          >
            <Download className="h-3.5 w-3.5" /> Export Reports
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
