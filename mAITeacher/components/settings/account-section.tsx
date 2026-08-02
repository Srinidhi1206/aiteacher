"use client";
import { LogOut, Trash2, KeyRound } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

export function AccountSection() {
  const { showToast } = useToast();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Account</CardTitle>
        <CardDescription className="hidden sm:block">Security and account-level actions</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between rounded-xl border border-gray-100 p-3 dark:border-gray-800">
          <div className="flex items-center gap-3">
            <KeyRound className="h-4 w-4 text-gray-400" />
            <div>
              <p className="text-sm font-medium text-gray-800 dark:text-gray-100">Change password</p>
              <p className="text-xs text-gray-400">Last changed 3 months ago</p>
            </div>
          </div>
          <Button size="sm" variant="outline" onClick={() => showToast("Password reset link sent", "Check your email to finish resetting your password.")}>
            Change
          </Button>
        </div>

        <div className="flex items-center justify-between rounded-xl border border-gray-100 p-3 dark:border-gray-800">
          <div className="flex items-center gap-3">
            <LogOut className="h-4 w-4 text-gray-400" />
            <div>
              <p className="text-sm font-medium text-gray-800 dark:text-gray-100">Sign out</p>
              <p className="text-xs text-gray-400">Sign out of mAITeacher on this device</p>
            </div>
          </div>
          <Button size="sm" variant="outline" onClick={() => showToast("Signed out", "You've been signed out of this device.")}>
            Sign Out
          </Button>
        </div>

        <div className="flex items-center justify-between rounded-xl border border-red-100 p-3 dark:border-red-900/40">
          <div className="flex items-center gap-3">
            <Trash2 className="h-4 w-4 text-red-500" />
            <div>
              <p className="text-sm font-medium text-red-600 dark:text-red-400">Delete account</p>
              <p className="text-xs text-gray-400">Permanently remove your account and all progress data</p>
            </div>
          </div>
          <Button
            size="sm"
            variant="danger"
            onClick={() => showToast("Account deletion requested", "We've sent a confirmation email - this is reversible for 14 days.")}
          >
            Delete
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
