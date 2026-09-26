// Runs once when the server starts (not during `next build`). In production it refuses to start
// with a missing or weak SESSION_SECRET, so a misconfigured deployment fails loudly at boot
// instead of serving a login that quietly errors - or, worse, signing sessions with a guessable
// key. The check reads the value but never prints it.
//
// On Vercel there is no single "boot": every serverless function runs this hook on each cold start,
// so exiting here would take down every route - including ones that never touch a session
// (onboarding, registration, logout) - with nothing but a generic 500. There the misconfiguration
// is logged loudly instead, and it stays fail-closed where it matters: signSession() and
// verifySession() (lib/auth/session.ts) re-run the same check on every use and refuse to sign or
// accept a session with a missing or weak secret, so no one can sign in until it is fixed.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.NODE_ENV === "production") {
    try {
      const { assertSessionSecretConfigured } = await import("./lib/auth/session");
      assertSessionSecretConfigured();
    } catch (err) {
      console.error(`\n[startup] ${err instanceof Error ? err.message : "Invalid server configuration."}`);
      if (process.env.VERCEL) {
        console.error("[startup] Sign-in is disabled until SESSION_SECRET is fixed in the Vercel project's environment variables.\n");
        return;
      }
      console.error("[startup] Refusing to start.\n");
      process.exit(1);
    }
  }
}
