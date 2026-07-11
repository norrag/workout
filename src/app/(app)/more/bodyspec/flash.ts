/**
 * One-shot outcome copy for a completed connect round trip — shared by the
 * /more/bodyspec screen (redirect params) and the callback's return-to-app
 * interstitial (doc 15 §8.5: the callback may finish in a browsing context
 * that has no app session, where it renders the same copy as a page instead
 * of redirecting). The §8.3 api_denied case gets its own line — it is the
 * one failure that needs a human follow-up
 * (docs/deployment/manual-operations.md → BodySpec).
 */
export function flashLine(
  params: { connected?: string; imported?: string; error?: string },
  lastSyncError: string | null,
): string | null {
  if (params.connected) {
    const n = Number(params.imported);
    if (Number.isFinite(n) && params.imported !== undefined) {
      return n > 0
        ? `Connected. Imported ${n} scan${n === 1 ? "" : "s"}.`
        : "Connected. No scans on the account yet — sync after your appointment.";
    }
    return lastSyncError
      ? "Connected, but the first import failed — try Sync now."
      : "Connected.";
  }
  switch (params.error) {
    case "denied":
      return "BodySpec authorization was declined. Nothing was connected.";
    case "state":
      return "The sign-in round trip didn't verify. Try connecting again.";
    case "exchange":
      return "BodySpec sign-in failed. Try connecting again.";
    case "api_denied":
      return "BodySpec accepted the sign-in but rejected the app's access token — this needs a configuration follow-up (see the deployment runbook).";
    case "not_configured":
      return "The BodySpec integration isn't configured for this environment.";
    default:
      return null;
  }
}
