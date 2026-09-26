import { cookies } from "next/headers";
import { Sidebar } from "@/components/layout/sidebar";
import { ToastProvider } from "@/components/ui/toast";
import { SESSION_COOKIE, verifySession } from "@/lib/auth/session";
import { SessionUserProvider } from "@/components/layout/session-user-context";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const token = cookies().get(SESSION_COOKIE)?.value;
  const session = await verifySession(token);

  return (
    <ToastProvider>
      <SessionUserProvider user={session ? { name: session.name, role: session.role } : null}>
      <div className="flex h-screen overflow-hidden bg-gray-50 dark:bg-gray-950">
        <div className="hidden lg:block">
          <Sidebar user={session} />
        </div>
        <div className="flex min-w-0 flex-1 flex-col overflow-y-auto">{children}</div>
      </div>
      </SessionUserProvider>
    </ToastProvider>
  );
}
