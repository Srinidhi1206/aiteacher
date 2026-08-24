"use client";
import { useRouter } from "next/navigation";
import { FileText, PenSquare } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export function ManageWorksheetsCard() {
  const router = useRouter();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-primary-500" /> Worksheets
        </CardTitle>
        <CardDescription className="hidden sm:block">Create and publish worksheets for the classes and subjects you&apos;re assigned to</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Attach optional files, track submissions, and grade them - scoped to your own assignments.
        </p>
        <Button size="sm" className="shrink-0 gap-1.5" onClick={() => router.push("/teacher/worksheets")}>
          <PenSquare className="h-3.5 w-3.5" /> Manage Worksheets
        </Button>
      </CardContent>
    </Card>
  );
}
