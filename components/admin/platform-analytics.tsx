"use client";
// Stage H: converted from mock (lib/mock-data/admin.ts) to real aggregate
// counts. Client component fetching via the server action directly (same
// pattern as components/admin/users-table.tsx) since this lives inside
// AdminTabs' client boundary - an async Server Component can't be
// imported there directly, see that file's own comment for why.
import * as React from "react";
import { Users, UserCheck, Clock, GraduationCap, ShieldCheck, School, Landmark, Layers, BookOpen, FileText, ClipboardList, Award, MessageCircleQuestion } from "lucide-react";
import { Card } from "@/components/ui/card";
import { DatabaseUnavailable } from "@/components/database-unavailable";
import { getPlatformAnalytics, type PlatformAnalytics } from "@/lib/actions/admin-analytics";

export function PlatformAnalytics() {
  const [data, setData] = React.useState<PlatformAnalytics | null>(null);
  const [unavailable, setUnavailable] = React.useState(false);

  React.useEffect(() => {
    getPlatformAnalytics()
      .then(setData)
      .catch(() => setUnavailable(true));
  }, []);

  if (unavailable) return <DatabaseUnavailable what="Platform analytics" />;
  if (!data) return <p className="py-8 text-center text-sm text-gray-400">Loading...</p>;

  const stats: { label: string; value: string; sub?: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { label: "Students", value: String(data.usersByRole.students), icon: GraduationCap },
    { label: "Teachers", value: String(data.usersByRole.teachers), icon: Users },
    { label: "Admins", value: String(data.usersByRole.admins), icon: ShieldCheck },
    { label: "Active Accounts", value: String(data.usersByStatus.active), sub: `${data.usersByStatus.suspended} suspended`, icon: UserCheck },
    {
      label: "Pending Registrations",
      value: String(data.pendingRegistrations.total),
      sub: `${data.pendingRegistrations.students} students, ${data.pendingRegistrations.teachers} teachers, ${data.pendingRegistrations.admins} admins`,
      icon: Clock,
    },
    { label: "New Registrations (30d)", value: String(data.registrationsLast30Days), icon: Clock },
    { label: "Schools", value: String(data.content.schools), sub: `${data.content.states} states, ${data.content.boards} boards`, icon: School },
    { label: "Classes", value: String(data.content.classes), sub: `${data.content.subjects} subjects, ${data.content.topics} topics`, icon: Layers },
    { label: "Study Materials", value: String(data.materials.total), sub: `${data.materials.published} published`, icon: BookOpen },
    { label: "Worksheets", value: String(data.worksheets), icon: FileText },
    { label: "Exams", value: String(data.exams.total), sub: `${data.exams.published} published`, icon: ClipboardList },
    { label: "Exam Submissions", value: String(data.examSubmissions.total), sub: `${data.examSubmissions.graded} graded`, icon: Award },
    { label: "AI Tutor Conversations", value: String(data.aiConversations), icon: MessageCircleQuestion },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {stats.map((stat) => (
        <Card key={stat.label} className="flex items-center gap-3 p-5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-100 text-primary-600 dark:bg-primary-950 dark:text-primary-300">
            <stat.icon className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400">{stat.label}</p>
            <p className="text-xl font-bold text-gray-900 dark:text-gray-50">{stat.value}</p>
            {stat.sub && <p className="truncate text-[11px] text-gray-400">{stat.sub}</p>}
          </div>
        </Card>
      ))}
    </div>
  );
}
