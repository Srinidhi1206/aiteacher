import { Topbar } from "@/components/layout/topbar";
import { AdminTabs } from "@/components/admin/admin-tabs";

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
