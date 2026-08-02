import { Topbar } from "@/components/layout/topbar";
import { ProfileSection } from "@/components/settings/profile-section";
import { AcademicSection } from "@/components/settings/academic-section";
import { NotificationsSection } from "@/components/settings/notifications-section";
import { AppearanceSection } from "@/components/settings/appearance-section";
import { AccountSection } from "@/components/settings/account-section";

export default function SettingsPage() {
  return (
    <>
      <Topbar title="Settings" />
      <main className="flex-1 space-y-6 p-4 sm:p-6">
        <ProfileSection />
        <AcademicSection />
        <NotificationsSection />
        <AppearanceSection />
        <AccountSection />
      </main>
    </>
  );
}
