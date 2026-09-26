// Real settings: a read-only profile from the database (name, school, board,
// class are managed by the school administrator, not editable here), a working
// password change, the theme selector and sign-out. The old sample profile /
// academic / notification / "delete account" cards were removed - they saved
// nothing and showed fake success messages.
import { Topbar } from "@/components/layout/topbar";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { DatabaseUnavailable } from "@/components/database-unavailable";
import { AppearanceSection } from "@/components/settings/appearance-section";
import { SecuritySection } from "@/components/settings/security-section";
import { getMyAccount } from "@/lib/actions/account";

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="text-xs font-medium text-gray-400">{label}</dt>
      <dd className="mt-0.5 text-sm text-gray-800 dark:text-gray-100">{value ?? "-"}</dd>
    </div>
  );
}

export default async function SettingsPage() {
  let account: Awaited<ReturnType<typeof getMyAccount>>;
  try {
    account = await getMyAccount();
  } catch {
    return (
      <>
        <Topbar title="Settings" />
        <main className="flex-1 p-4 sm:p-6">
          <DatabaseUnavailable what="Your account" />
        </main>
      </>
    );
  }

  return (
    <>
      <Topbar title="Settings" />
      <main className="flex-1 space-y-6 p-4 sm:p-6">
        <Card>
          <CardHeader>
            <CardTitle>Profile</CardTitle>
            <CardDescription className="hidden sm:block">Managed by your school administrator</CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Name" value={account.name} />
              <Field label={account.role === "student" ? "Student ID" : "Username"} value={account.username} />
              <Field label="Role" value={account.role.charAt(0).toUpperCase() + account.role.slice(1)} />
              <Field label="School" value={account.schoolName} />
              <Field label="Board" value={account.boardName} />
              {account.role === "student" && <Field label="Class" value={account.className} />}
            </dl>
          </CardContent>
        </Card>
        <SecuritySection />
        <AppearanceSection />
      </main>
    </>
  );
}
