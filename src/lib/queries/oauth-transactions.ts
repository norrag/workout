import "server-only";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * doc 15 §8.5 (N34) — the server-side OAuth round trip. The installed-PWA
 * connect flow spans two browsing contexts (the app taps CONNECT; iOS runs
 * the BodySpec login — and our callback — in an in-app browser sheet with a
 * separate cookie jar), so nothing about the round trip may live in cookies.
 * The `oauth_transactions` table is deny-all to client roles; both helpers
 * here go through the service role. `create` scopes by a session-derived
 * user id (hard rule 4). `consume` is the one deliberate exception to
 * user-scoping: the callback context has no identity — the 256-bit
 * single-use `state` with a 10-minute TTL IS the credential, and the row it
 * redeems can only ever connect the account of the user who started the
 * flow.
 */

export const OAUTH_TRANSACTION_TTL_SECONDS = 600;

export async function createBodySpecOAuthTransaction(input: {
  userId: string;
  state: string;
  codeVerifier: string;
}): Promise<void> {
  const service = createServiceClient();
  // opportunistic prune (no cron): abandoned flows expire in minutes, so
  // clearing them on the next connect keeps the table a handful of rows
  await service
    .from("oauth_transactions")
    .delete()
    .lt("expires_at", new Date().toISOString());
  const { error } = await service.from("oauth_transactions").insert({
    state: input.state,
    user_id: input.userId,
    provider: "bodyspec",
    code_verifier: input.codeVerifier,
    expires_at: new Date(
      Date.now() + OAUTH_TRANSACTION_TTL_SECONDS * 1000,
    ).toISOString(),
  });
  if (error) throw error;
}

/** Redeem a round trip: delete-returning by state (single-use — a replayed
 *  callback finds nothing), then enforce the TTL. Null ⇒ unknown, already
 *  used, or expired; the caller reports the state error. */
export async function consumeBodySpecOAuthTransaction(
  state: string,
): Promise<{ userId: string; codeVerifier: string } | null> {
  const service = createServiceClient();
  const { data, error } = await service
    .from("oauth_transactions")
    .delete()
    .eq("state", state)
    .eq("provider", "bodyspec")
    .select()
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  if (new Date(data.expires_at).getTime() < Date.now()) return null;
  return { userId: data.user_id, codeVerifier: data.code_verifier };
}
