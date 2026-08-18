import { cookies } from "next/headers";
import { Sidebar } from "@/components/layout/sidebar";
import { ToastProvider } from "@/components/ui/toast";
import { SESSION_COOKIE, verifySession } from "@/lib/auth/session";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const token = cookies().get(SESSION_COOKIE)?.value;
  const session = await verifySession(token);

  return (
    <ToastProvider>
      <div className="flex h-screen overflow-hidden bg-gray-50 dark:bg-gray-950">
        <div className="hidden lg:block">
          <Sidebar user={session} />
        </div>
        <div className="flex min-w-0 flex-1 flex-col overflow-y-auto">{children}</div>
      </div>
    </ToastProvider>
  );
}
