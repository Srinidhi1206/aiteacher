"use client";
// Admin panel tabs. Every tab here is backed by real, school-scoped server
// actions. The former Board & Classes, Prompt Templates and System Settings
// tabs were removed: they held local state only and saved nothing (a school's
// board is set at registration, classes and subjects come from the real
// curriculum under Subjects & Curriculum).
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { UsersTable } from "@/components/admin/users-table";
import { SubjectsTable } from "@/components/admin/subjects-table";
import { PlatformAnalytics } from "@/components/admin/platform-analytics";
import { LogsTable } from "@/components/admin/logs-table";
import { StudyMaterialsCard } from "@/components/admin/study-materials-card";
import { ExamScheduleCard } from "@/components/admin/exam-schedule-card";

export function AdminTabs() {
  return (
    <Tabs defaultValue="analytics" className="space-y-6">
      <TabsList className="flex-wrap">
        <TabsTrigger value="analytics">Dashboard</TabsTrigger>
        <TabsTrigger value="users">Users</TabsTrigger>
        <TabsTrigger value="subjects">Subjects &amp; Curriculum</TabsTrigger>
        <TabsTrigger value="materials">Study Materials</TabsTrigger>
        <TabsTrigger value="exam-schedule">Exam Schedule</TabsTrigger>
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
