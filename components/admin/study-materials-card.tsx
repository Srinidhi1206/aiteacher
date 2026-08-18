"use client";
import * as React from "react";
import { UploadCloud, FileText, CheckCircle2, Loader2, AlertTriangle } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { adminStudyMaterials as initialMaterials } from "@/lib/mock-data/admin-config";
import { CLASS_OPTIONS } from "@/lib/classes";
import { cn } from "@/lib/utils";

const statusMeta = {
  processing: { label: "Processing...", icon: Loader2, classes: "text-warning-600 dark:text-warning-400" },
  ready: { label: "Ready", icon: CheckCircle2, classes: "text-success-600 dark:text-success-400" },
  error: { label: "Failed", icon: AlertTriangle, classes: "text-red-600 dark:text-red-400" },
};

export function StudyMaterialsCard() {
  const [materials, setMaterials] = React.useState(initialMaterials);
  const [dragActive, setDragActive] = React.useState(false);
  const [className, setClassName] = React.useState(CLASS_OPTIONS[7].value);
  const { showToast } = useToast();

  function simulateUpload(fileName: string) {
    const id = `asm-${materials.length + 1}-${Date.now()}`;
    setMaterials((prev) => [
      { id, fileName, subject: "General", className, sizeKb: Math.round(300 + Math.random() * 2500), uploadedAt: new Date().toISOString().slice(0, 10), status: "processing" },
      ...prev,
    ]);
    showToast(`Uploaded "${fileName}"`, `Added to the ${className} material library for this session.`);
    setTimeout(() => {
      setMaterials((prev) => prev.map((m) => (m.id === id ? { ...m, status: "ready" } : m)));
    }, 2000);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UploadCloud className="h-4 w-4 text-primary-500" /> Study Materials
        </CardTitle>
        <CardDescription className="hidden sm:block">
          Upload subject material for a class. Files are held in this session only - not persisted yet.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="mb-3 flex items-center gap-2">
          <label className="text-xs font-semibold text-gray-500">Class</label>
          <select
            value={className}
            onChange={(e) => setClassName(e.target.value)}
            className="rounded-xl border border-gray-200 bg-transparent px-3 py-1.5 text-sm text-gray-800 outline-none focus:border-primary-400 dark:border-gray-700 dark:text-gray-100"
          >
            {CLASS_OPTIONS.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </div>

        <label
          onDragOver={(e) => {
            e.preventDefault();
            setDragActive(true);
          }}
          onDragLeave={() => setDragActive(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragActive(false);
            simulateUpload(e.dataTransfer.files?.[0]?.name ?? "New_Material.pdf");
          }}
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
                      {m.className ?? m.subject} - {(m.sizeKb / 1024).toFixed(1)} MB
                    </p>
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
