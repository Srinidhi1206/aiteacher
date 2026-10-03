import { Topbar } from "@/components/layout/topbar";
import { AdminTabs } from "@/components/admin/admin-tabs";

// The Server Actions called from this page (notably indexing a study material for the AI Tutor) run
// under this limit. 60 s is the most every Vercel plan allows; indexing is built to finish across
// several calls, so it never needs more than one call's worth.
export const maxDuration = 60;

export default function AdminPanelPage() {
  return (
    <>
      <Topbar title="Admin Panel" />
      <main className="flex-1 p-4 sm:p-6">
        <AdminTabs />
      </main>
    </>
  );
}
