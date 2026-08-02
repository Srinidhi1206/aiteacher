import { Construction } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export function PlaceholderPage({ title, description }: { title: string; description?: string }) {
  return (
    <Card className="flex min-h-[60vh] flex-col items-center justify-center text-center">
      <CardContent className="flex flex-col items-center gap-4 py-16">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary-50 text-primary-600 dark:bg-primary-950 dark:text-primary-300">
          <Construction className="h-8 w-8" />
        </div>
        <div>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-50">{title}</h2>
          <p className="mt-2 max-w-md text-sm text-gray-500 dark:text-gray-400">
            {description ?? "This page is coming in the next phase of mAITeacher. We're building it out with the same care as the rest of the app."}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
