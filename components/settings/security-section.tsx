"use client";
// Real account actions: changeMyPassword and sign-out. Nothing here is a
// placeholder - the password form calls the server action, which verifies the
// current password with bcrypt before storing a new hash.
import * as React from "react";
import { useRouter } from "next/navigation";
import { KeyRound, LogOut, Loader2 } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { inputClass, labelClass } from "@/components/register/field-styles";
import { changeMyPassword } from "@/lib/actions/account";

export function SecuritySection() {
  const router = useRouter();
  const { showToast } = useToast();
  const [current, setCurrent] = React.useState("");
  const [next, setNext] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function handleChange(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (next !== confirm) {
      setError("The new passwords do not match.");
      return;
    }
    setBusy(true);
    const res = await changeMyPassword(current, next);
    setBusy(false);
    if (!res.ok) {
      setError(res.error ?? "Could not change your password.");
      return;
    }
    setCurrent("");
    setNext("");
    setConfirm("");
    showToast("Password changed", "Use your new password the next time you sign in.");
  }

  async function handleSignOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-primary-500" /> Change password
          </CardTitle>
          <CardDescription className="hidden sm:block">Enter your current password to set a new one.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleChange} className="grid max-w-md gap-3">
            {error && (
              <p role="alert" className="text-sm text-red-600 dark:text-red-400">
                {error}
              </p>
            )}
            <div>
              <label className={labelClass} htmlFor="current-password">Current password</label>
              <input id="current-password" type="password" autoComplete="current-password" className={inputClass} value={current} onChange={(e) => setCurrent(e.target.value)} required disabled={busy} />
            </div>
            <div>
              <label className={labelClass} htmlFor="new-password">New password</label>
              <input id="new-password" type="password" autoComplete="new-password" className={inputClass} value={next} onChange={(e) => setNext(e.target.value)} required disabled={busy} placeholder="At least 8 characters, letters and numbers" />
            </div>
            <div>
              <label className={labelClass} htmlFor="confirm-password">Confirm new password</label>
              <input id="confirm-password" type="password" autoComplete="new-password" className={inputClass} value={confirm} onChange={(e) => setConfirm(e.target.value)} required disabled={busy} />
            </div>
            <div>
              <Button type="submit" disabled={busy}>
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} Change password
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex items-center justify-between gap-3 p-4">
          <div className="flex items-center gap-3">
            <LogOut className="h-4 w-4 text-gray-400" />
            <div>
              <p className="text-sm font-medium text-gray-800 dark:text-gray-100">Sign out</p>
              <p className="text-xs text-gray-400">Sign out of mAITeacher on this device</p>
            </div>
          </div>
          <Button size="sm" variant="outline" onClick={handleSignOut}>
            Sign out
          </Button>
        </CardContent>
      </Card>
    </>
  );
}
