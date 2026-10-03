"use client";
// The student's Study Materials list with a search box and a subject filter. The list itself (what the student may see)
// is decided on the server by lib/actions/materials.ts; this only narrows what was already allowed.
import * as React from "react";
import { FileText, Download, ExternalLink, Search } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { inputClass } from "@/components/register/field-styles";

export interface BrowsableMaterial {
  id: string;
  title: string;
  description: string | null;
  fileUrl: string;
  materialType: string;
  subjectName: string;
  chapterName: string | null;
  topicName: string | null;
  sizeKb: number;
}

const TYPE_LABEL: Record<string, string> = {
  TEXTBOOK: "Textbook",
  STUDY_MATERIAL: "Study material",
  QUESTION_PAPER: "Question paper",
  NOTES: "Notes",
  REFERENCE: "Reference",
  VIDEO: "Video",
  PDF: "PDF",
  PRESENTATION: "Presentation",
  OTHER: "Other",
};

export function MaterialsBrowser({ materials }: { materials: BrowsableMaterial[] }) {
  const [query, setQuery] = React.useState("");
  const [subject, setSubject] = React.useState("ALL");
  const subjects = Array.from(new Set(materials.map((m) => m.subjectName))).sort();
  const needle = query.trim().toLowerCase();

  const visible = materials.filter((m) => {
    if (subject !== "ALL" && m.subjectName !== subject) return false;
    if (needle && ![m.title, m.description ?? "", m.chapterName ?? "", m.topicName ?? "", m.subjectName].some((v) => v.toLowerCase().includes(needle))) return false;
    return true;
  });
  const bySubject = new Map<string, BrowsableMaterial[]>();
  for (const m of visible) bySubject.set(m.subjectName, [...(bySubject.get(m.subjectName) ?? []), m]);

  return (
    <div className="space-y-6">
      {(materials.length > 4 || subjects.length > 1) && (
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="search"
              aria-label="Search study materials"
              placeholder="Search by title, chapter or subject"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className={`${inputClass} !pl-9`}
            />
          </div>
          {subjects.length > 1 && (
            <select aria-label="Filter by subject" className={`${inputClass} sm:w-56`} value={subject} onChange={(e) => setSubject(e.target.value)}>
              <option value="ALL">All subjects</option>
              {subjects.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          )}
        </div>
      )}

      {visible.length === 0 ? (
        <p className="py-10 text-center text-sm text-gray-500 dark:text-gray-400">No study materials match your search.</p>
      ) : (
        [...bySubject.entries()].map(([subjectName, items]) => (
          <Card key={subjectName}>
            <CardHeader>
              <CardTitle>{subjectName}</CardTitle>
              <CardDescription className="hidden sm:block">
                {items.length} material{items.length === 1 ? "" : "s"}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {items.map((m) => (
                <div key={m.id} className="flex flex-col gap-2 rounded-xl border border-gray-100 p-3 dark:border-gray-800 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-start gap-2.5">
                    <FileText className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-800 dark:text-gray-100">{m.title}</p>
                      <p className="text-xs text-gray-400">
                        {m.chapterName ?? "Whole subject"}
                        {m.topicName ? ` - ${m.topicName}` : ""} - {(m.sizeKb / 1024).toFixed(1)} MB
                      </p>
                      {m.description && <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{m.description}</p>}
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    <Badge variant="primary">{TYPE_LABEL[m.materialType] ?? m.materialType}</Badge>
                    <a
                      href={m.fileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                    >
                      <ExternalLink className="h-3.5 w-3.5" /> Open
                    </a>
                    <a
                      href={m.fileUrl}
                      download
                      className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                    >
                      <Download className="h-3.5 w-3.5" /> Download
                    </a>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
