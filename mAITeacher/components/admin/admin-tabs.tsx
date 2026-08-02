"use client";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { UsersTable } from "@/components/admin/users-table";
import { SubjectsTable } from "@/components/admin/subjects-table";
import { PlatformAnalytics } from "@/components/admin/platform-analytics";
import { SystemSettingsCard } from "@/components/admin/system-settings-card";
import { PromptTemplatesGrid } from "@/components/admin/prompt-templates-grid";
import { LogsTable } from "@/components/admin/logs-table";

export function AdminTabs() {
  return (
    <Tabs defaultValue="analytics" className="space-y-6">
      <TabsList className="flex-wrap">
        <TabsTrigger value="analytics">Analytics</TabsTrigger>
        <TabsTrigger value="users">Users</TabsTrigger>
        <TabsTrigger value="subjects">Subjects &amp; Curriculum</TabsTrigger>
        <TabsTrigger value="prompts">Prompt Templates</TabsTrigger>
        <TabsTrigger value="settings">System Settings</TabsTrigger>
        <TabsTrigger value="logs">Logs</TabsTrigger>
      </TabsList>

      <TabsContent value="analytics">
        <PlatformAnalytics />
      </TabsContent>
      <TabsContent value="users">
        <UsersTable />
      </TabsContent>
      <TabsContent value="subjects">
        <SubjectsTable />
      </TabsContent>
      <TabsContent value="prompts">
        <PromptTemplatesGrid />
      </TabsContent>
      <TabsContent value="settings">
        <SystemSettingsCard />
      </TabsContent>
      <TabsContent value="logs">
        <LogsTable />
      </TabsContent>
    </Tabs>
  );
}
