"use client";
import * as React from "react";

// The signed-in user, read once on the server in the (app) layout and handed
// to client chrome (welcome banner, top bar, mobile menu) so they show the
// real account instead of the built-in sample student. Display only - it
// carries no authority; every server action still re-derives the actor from
// the session cookie.
export interface SessionUserInfo {
  name: string;
  role: "admin" | "teacher" | "student";
}

const SessionUserContext = React.createContext<SessionUserInfo | null>(null);

export function SessionUserProvider({ user, children }: { user: SessionUserInfo | null; children: React.ReactNode }) {
  return <SessionUserContext.Provider value={user}>{children}</SessionUserContext.Provider>;
}

export function useSessionUser(): SessionUserInfo | null {
  return React.useContext(SessionUserContext);
}
