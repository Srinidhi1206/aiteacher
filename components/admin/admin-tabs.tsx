"use client";
// Admin panel tabs. Every tab here is backed by real, school-scoped server
// actions. The former Board & Classes, Prompt Templates and System Settings
// tabs were removed: they held local state only and saved nothing (a school's
// board is set at registration, classes and subjects come from the real
// curriculum under Subjects & Curriculum). The Schools tab is for the platform
// super administrator only - it is hidden for school admins and the server
// refuses their calls regardless.
import * as React from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { UsersTable } from "@/components/admin/users-table";
import { SubjectsTable } from "@/components/admin/subjects-table";
import { PlatformAnalytics } from "@/components/admin/platform-analytics";
import { LogsTable } from "@/components/admin/logs-table";
import { StudyMaterialsCard } from "@/components/admin/study-materials-card";
import { ExamScheduleCard } from "@/components/admin/exam-schedule-card";
import { SchoolsPanel } from "@/components/admin/schools-panel";
import { getMyAdminStatus } from "@/lib/actions/user-management";

export function AdminTabs() {
  const [isSuperAdmin, setIsSuperAdmin] = React.useState(false);
  React.useEffect(() => {
    getMyAdminStatus()
      .then((me) => setIsSuperAdmin(me?.isSuperAdmin === true))
      .catch(() => setIsSuperAdmin(false));
  }, []);

  return (
    <Tabs defaultValue="analytics" className="space-y-6">
      <TabsList className="flex-wrap">
        <TabsTrigger value="analytics">Dashboard</TabsTrigger>
        {isSuperAdmin && <TabsTrigger value="schools">Schools</TabsTrigger>}
        <TabsTrigger value="users">Users</TabsTrigger>
        <TabsTrigger value="subjects">Subjects &amp; Curriculum</TabsTrigger>
        <TabsTrigger value="materials">Study Materials</TabsTrigger>
        <TabsTrigger value="exam-schedule">Exam Schedule</TabsTrigger>
        <TabsTrigger value="logs">Logs</TabsTrigger>
      </TabsList>

      <TabsContent value="analytics">
        <PlatformAnalytics />
      </TabsContent>
      {isSuperAdmin && (
        <TabsContent value="schools">
          <SchoolsPanel />
        </TabsContent>
      )}
      <TabsContent value="users">
        <UsersTable />
      </TabsContent>
      <TabsContent value="subjects">
        <SubjectsTable />
      </TabsContent>
      <TabsContent value="materials">
        <StudyMaterialsCard />
      </TabsContent>
      <TabsContent value="exam-schedule">
        <ExamScheduleCard />
      </TabsContent>
      <TabsContent value="logs">
        <LogsTable />
      </TabsContent>
    </Tabs>
  );
}
