import { FileText, ExternalLink } from "lucide-react";
import type { MyMaterial } from "@/lib/actions/student-curriculum";

const typeLabel: Record<string, string> = {
  TEXTBOOK: "Textbook",
  NOTES: "Notes",
  REFERENCE: "Reference",
  VIDEO: "Video",
  PDF: "PDF",
  PRESENTATION: "Presentation",
  OTHER: "Other",
};

/** The published materials your school filed under a chapter/topic. Renders nothing when there are none. */
export function MaterialLinks({ materials }: { materials: MyMaterial[] }) {
  if (materials.length === 0) return null;
  return (
    <ul className="space-y-1.5">
      {materials.map((m) => (
        <li key={m.id}>
          <a
            href={m.fileUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 rounded-lg border border-gray-100 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 dark:border-gray-800 dark:text-gray-200 dark:hover:bg-gray-800/50"
          >
            <FileText className="h-4 w-4 shrink-0 text-gray-400" />
            <span className="min-w-0 flex-1 truncate">{m.title}</span>
            <span className="shrink-0 text-xs text-gray-400">{typeLabel[m.materialType] ?? m.materialType}</span>
            <ExternalLink className="h-3.5 w-3.5 shrink-0 text-gray-400" />
          </a>
        </li>
      ))}
    </ul>
  );
}
