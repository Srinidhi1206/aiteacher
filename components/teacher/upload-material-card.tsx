"use client";
import * as React from "react";
import { UploadCloud, FileText, Loader2, CheckCircle2, AlertTriangle } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { uploadedMaterials as initialMaterials } from "@/lib/mock-data/teacher";
import { cn } from "@/lib/utils";

const statusMeta = {
  processing: { label: "AI is extracting topics...", icon: Loader2, classes: "text-warning-600 dark:text-warning-400" },
  ready: { label: "Topics extracted", icon: CheckCircle2, classes: "text-success-600 dark:text-success-400" },
  error: { label: "Extraction failed", icon: AlertTriangle, classes: "text-red-600 dark:text-red-400" },
};

export function UploadMaterialCard() {
  const [materials, setMaterials] = React.useState(initialMaterials);
  const [dragActive, setDragActive] = React.useState(false);
  const { showToast } = useToast();

  function simulateUpload(fileName: string) {
    const id = `um-${materials.length + 1}-${Date.now()}`;
    setMaterials((prev) => [
      { id, fileName, subject: "Mathematics", sizeKb: Math.round(400 + Math.random() * 3000), uploadedAt: "2026-07-19", status: "processing" },
      ...prev,
    ]);
    showToast(`Uploaded "${fileName}"`, "AI is now extracting chapters and topics from this file.");
    setTimeout(() => {
      setMaterials((prev) =>
        prev.map((m) => (m.id === id ? { ...m, status: "ready", extractedTopics: ["Auto-detected Topic 1", "Auto-detected Topic 2"] } : m))
      );
    }, 2600);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    simulateUpload(file?.name ?? "New_Material.pdf");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UploadCloud className="h-4 w-4 text-primary-500" /> Upload Material
        </CardTitle>
        <CardDescription className="hidden sm:block">AI extracts topics automatically</CardDescription>
      </CardHeader>
      <CardContent>
        <label
          onDragOver={(e) => {
            e.preventDefault();
            setDragActive(true);
          }}
          onDragLeave={() => setDragActive(false)}
          onDrop={handleDrop}
          className={cn(
            "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-8 text-center transition-colors",
            dragActive ? "border-primary-400 bg-primary-50 dark:bg-primary-950/30" : "border-gray-200 dark:border-gray-700"
          )}
        >
          <UploadCloud className="h-8 w-8 text-gray-400" />
          <p className="text-sm font-medium text-gray-700 dark:text-gray-200">Drag and drop a file here, or click to browse</p>
          <p className="text-xs text-gray-400">PDF, DOCX, PPTX up to 25MB</p>
          <input
            type="file"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) simulateUpload(file.name);
            }}
          />
        </label>

        <div className="mt-4 space-y-2">
          {materials.map((m) => {
            const meta = statusMeta[m.status];
            const Icon = meta.icon;
            return (
              <div key={m.id} className="flex items-start justify-between gap-2 rounded-xl border border-gray-100 p-3 dark:border-gray-800">
                <div className="flex items-start gap-2.5">
                  <FileText className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                  <div>
                    <p className="text-sm font-medium text-gray-800 dark:text-gray-100">{m.fileName}</p>
                    <p className="text-xs text-gray-400">
                      {m.subject} - {(m.sizeKb / 1024).toFixed(1)} MB
                    </p>
                    {m.extractedTopics && (
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Topics: {m.extractedTopics.join(", ")}</p>
                    )}
                  </div>
                </div>
                <span className={cn("flex shrink-0 items-center gap-1 text-xs font-medium", meta.classes)}>
                  <Icon className={cn("h-3.5 w-3.5", m.status === "processing" && "animate-spin")} />
                  {meta.label}
                </span>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
