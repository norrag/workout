import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, ExternalConnectionRow } from "@/lib/types/database";
import { createServiceClient } from "@/lib/supabase/service";
import {
  bodyspecClientId,
  refreshTokens,
  revokeToken,
  BodySpecReconnectRequired,
} from "@/lib/bodyspec/oauth";
import type { BodySpecTokenSet } from "@/lib/bodyspec/schemas";

type Client = SupabaseClient<Database>;

/**
 * doc 15 §2.2 (N34 Phase 5a) — the account link. The connection ROW is plain
 * owner-scoped data and moves through the caller's session client (RLS). The
 * SECRETS live in the deny-all `external_connection_secrets` table and move
 * exclusively through the service-role call sites below — every one scoped by
 * an explicit, server-derived user id (hard rule 4). Nothing token-shaped is
 * ever returned to a component; the widest thing that leaves this module is
 * a short-lived access token handed to the sync path.
 */

export async function getBodySpecConnection(
  supabase: Client,
  userId: string,
): Promise<ExternalConnectionRow | null> {
  const { data, error } = await supabase
    .from("external_connections")
    .select("*")
    .eq("user_id", userId)
    .eq("provider", "bodyspec")
    .maybeSingle();
  if (error) throw error;
  return data;
}

/** Create or refresh the connection row after a completed OAuth flow
 *  (re-connect replaces identity + resets status). */
export async function upsertBodySpecConnection(
  supabase: Client,
  userId: string,
  identity: { providerUserId: string; providerEmail: string | null },
): Promise<ExternalConnectionRow> {
  const { data, error } = await supabase
    .from("external_connections")
    .upsert(
      {
        user_id: userId,
        provider: "bodyspec",
        status: "connected",
        provider_user_id: identity.providerUserId,
        provider_email: identity.providerEmail,
        connected_at: new Date().toISOString(),
        last_synced_at: null,
        last_sync_error: null,
      },
      { onConflict: "user_id,provider" },
    )
    .select()
    .single();
  if (error) throw error;
  return data;
}

/** Stamp a sync outcome on the row (the screen's LAST SYNCED / error line). */
export async function markBodySpecSyncResult(
  supabase: Client,
  userId: string,
  outcome: { ok: true } | { ok: false; message: string },
): Promise<void> {
  const { error } = await supabase
    .from("external_connections")
    .update(
      outcome.ok
        ? {
            status: "connected",
            last_synced_at: new Date().toISOString(),
            last_sync_error: null,
          }
        : { status: "error", last_sync_error: outcome.message },
    )
    .eq("user_id", userId)
    .eq("provider", "bodyspec");
  if (error) throw error;
}

/** Persist a token set (connect or rotation). Service-role: the secrets table
 *  is deny-all to client roles. */
export async function saveBodySpecSecrets(
  userId: string,
  connectionId: string,
  tokens: BodySpecTokenSet,
): Promise<void> {
  const service = createServiceClient();
  const { error } = await service.from("external_connection_secrets").upsert(
    {
      connection_id: connectionId,
      user_id: userId,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token ?? null,
      access_token_expires_at: tokens.expires_in
        ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
        : null,
      scope: tokens.scope ?? null,
    },
    { onConflict: "connection_id" },
  );
  if (error) throw error;
}

/**
 * A currently-valid access token for the user's BodySpec connection,
 * refreshing through the rotation grant when the stored one is expired or
 * within the skew window. Throws `BodySpecReconnectRequired` when the refresh
 * grant is dead — callers mark the row `error` and the screen offers
 * RECONNECT (doc 15 §1.1 cheap re-connect posture).
 */
export async function getFreshBodySpecAccessToken(
  userId: string,
  connectionId: string,
): Promise<string> {
  const service = createServiceClient();
  const { data, error } = await service
    .from("external_connection_secrets")
    .select("access_token, refresh_token, access_token_expires_at")
    .eq("connection_id", connectionId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new BodySpecReconnectRequired("no stored tokens");

  const skewMs = 60 * 1000;
  const expiresAt = data.access_token_expires_at
    ? new Date(data.access_token_expires_at).getTime()
    : null;
  if (expiresAt === null || expiresAt - skewMs > Date.now()) {
    return data.access_token;
  }
  if (!data.refresh_token) {
    throw new BodySpecReconnectRequired("access token expired, no refresh token");
  }
  const clientId = bodyspecClientId();
  if (!clientId) throw new BodySpecReconnectRequired("integration not configured");
  const rotated = await refreshTokens({
    clientId,
    refreshToken: data.refresh_token,
  });
  await saveBodySpecSecrets(userId, connectionId, {
    ...rotated,
    // Keycloak may omit a new refresh token on rotation — keep the old one
    refresh_token: rotated.refresh_token ?? data.refresh_token,
  });
  return rotated.access_token;
}

/**
 * Disconnect: best-effort provider-side revocation, then delete the
 * connection row (secrets cascade). Local destruction is the guarantee —
 * doc 15 §2.3 "always destroy tokens".
 */
export async function disconnectBodySpec(
  supabase: Client,
  userId: string,
): Promise<void> {
  const connection = await getBodySpecConnection(supabase, userId);
  if (!connection) return;

  const clientId = bodyspecClientId();
  if (clientId) {
    const service = createServiceClient();
    const { data } = await service
      .from("external_connection_secrets")
      .select("refresh_token, access_token")
      .eq("connection_id", connection.id)
      .eq("user_id", userId)
      .maybeSingle();
    const token = data?.refresh_token ?? data?.access_token;
    if (token) await revokeToken({ clientId, token });
  }

  const { error } = await supabase
    .from("external_connections")
    .delete()
    .eq("id", connection.id)
    .eq("user_id", userId);
  if (error) throw error;
}
