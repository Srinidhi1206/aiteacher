"use client";
import { useRouter } from "next/navigation";
import { FileEdit, PenSquare } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export function CreateExamsCard() {
  const router = useRouter();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileEdit className="h-4 w-4 text-primary-500" /> Exams
        </CardTitle>
        <CardDescription className="hidden sm:block">Create real exams for your classes, add questions, publish, and grade submissions</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Manage exams for the classes and subjects you&apos;re assigned to - question builder, publish/unpublish, and grading
          are all here.
        </p>
        <Button size="sm" className="shrink-0 gap-1.5" onClick={() => router.push("/teacher/exams")}>
          <PenSquare className="h-3.5 w-3.5" /> Manage Exams
        </Button>
      </CardContent>
    </Card>
  );
}
