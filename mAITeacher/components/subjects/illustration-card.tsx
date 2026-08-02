import { Waypoints, LineChart, PieChart, Shapes } from "lucide-react";
import { Illustration } from "@/lib/types";

const kindIcon = {
  diagram: Waypoints,
  graph: LineChart,
  chart: PieChart,
  figure: Shapes,
};

export function IllustrationCard({ illustration }: { illustration: Illustration }) {
  const Icon = kindIcon[illustration.kind];
  return (
    <div className="overflow-hidden rounded-2xl border border-gray-100 dark:border-gray-800">
      <div className="relative flex h-36 items-center justify-center bg-[linear-gradient(135deg,theme(colors.primary.50),theme(colors.gray.50))] dark:bg-[linear-gradient(135deg,theme(colors.primary.950),theme(colors.gray.900))]">
        <svg className="absolute inset-0 h-full w-full opacity-40" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id={`dots-${illustration.title.replace(/\s+/g, "-")}`} width="16" height="16" patternUnits="userSpaceOnUse">
              <circle cx="1.5" cy="1.5" r="1.5" className="fill-primary-200 dark:fill-primary-800" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill={`url(#dots-${illustration.title.replace(/\s+/g, "-")})`} />
        </svg>
        <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-white text-primary-600 shadow-soft dark:bg-gray-900 dark:text-primary-400">
          <Icon className="h-8 w-8" />
        </div>
      </div>
      <div className="bg-white p-3 dark:bg-gray-900">
        <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">{illustration.title}</p>
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{illustration.caption}</p>
      </div>
    </div>
  );
}
