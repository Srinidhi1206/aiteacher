"use client";
import * as React from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { useToast } from "@/components/ui/toast";
import { currentStudent } from "@/lib/mock-data/students";

const inputClasses =
  "w-full rounded-xl border border-gray-200 bg-transparent px-3 py-2 text-sm text-gray-800 outline-none focus:border-primary-400 dark:border-gray-700 dark:text-gray-100";

export function ProfileSection() {
  const [name, setName] = React.useState(currentStudent.name);
  const [email, setEmail] = React.useState(currentStudent.email);
  const { showToast } = useToast();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Profile</CardTitle>
        <CardDescription className="hidden sm:block">Your basic account details</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-4">
          <Avatar initials={currentStudent.avatarInitials} colorClassName={currentStudent.avatarColor} size="lg" />
          <div>
            <p className="text-sm font-semibold text-gray-900 dark:text-gray-50">{currentStudent.name}</p>
            <p className="text-xs text-gray-400">Joined {new Date(currentStudent.joinedDate).toLocaleDateString("en-US", { month: "long", year: "numeric" })}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-gray-500">Full Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} className={inputClasses} />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-gray-500">Email</label>
            <input value={email} onChange={(e) => setEmail(e.target.value)} className={inputClasses} />
          </div>
        </div>

        <div className="flex justify-end">
          <Button size="sm" onClick={() => showToast("Profile updated", "Your changes have been saved.")}>
            Save Changes
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
