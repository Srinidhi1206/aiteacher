// Runs once when the server starts (not during `next build`). In production it refuses to start
// with a missing or weak SESSION_SECRET, so a misconfigured deployment fails loudly at boot
// instead of serving a login that quietly errors - or, worse, signing sessions with a guessable
// key. The check reads the value but never prints it.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.NODE_ENV === "production") {
    try {
      const { assertSessionSecretConfigured } = await import("./lib/auth/session");
      assertSessionSecretConfigured();
    } catch (err) {
      console.error(`\n[startup] ${err instanceof Error ? err.message : "Invalid server configuration."}\n[startup] Refusing to start.\n`);
      process.exit(1);
    }
  }
}
