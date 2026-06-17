import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createRemoteJWKSet, jwtVerify } from "jose";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import type { Database } from "@/lib/types/database";

/**
 * MCP auth bridge to Supabase Auth (05 §Auth).
 *
 * `/api/mcp` is a pure **resource server**: it validates the bearer JWT issued
 * by Supabase's OAuth 2.1 server against the project JWKS and resolves identity
 * from the token alone. No tool ever accepts a `user_id` argument — the model
 * can never address another user's data. Per-user scoping is then enforced by
 * **RLS** via a token-bound client (`createMcpRlsClient`); service-role is
 * reserved for the few spots RLS can't cover (audit writes, admin cross-scope).
 */

function supabaseUrl(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL is not configured");
  return url.replace(/\/$/, "");
}

function anonKey(): string {
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!key) throw new Error("NEXT_PUBLIC_SUPABASE_ANON_KEY is not configured");
  return key;
}

/** Supabase issues tokens with `iss = <url>/auth/v1`; JWKS is published there. */
export function issuer(): string {
  return process.env.SUPABASE_JWT_ISSUER || `${supabaseUrl()}/auth/v1`;
}

// Cache the remote key set across requests (jose caches/refreshes internally).
let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;
function keySet() {
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(`${issuer()}/.well-known/jwks.json`));
  }
  return jwks;
}

/** Identity carried on every authenticated tool/resource call. */
export interface McpIdentity {
  userId: string;
  /** the raw bearer JWT, re-bound onto the RLS client */
  token: string;
  /** OAuth client that holds the grant (for the audit trail) */
  clientId: string;
  scopes: string[];
}

function identityFromAuthInfo(auth: AuthInfo): McpIdentity {
  const extra = (auth.extra ?? {}) as Partial<McpIdentity>;
  if (!extra.userId) {
    throw new Error("authenticated session is missing a user id");
  }
  return {
    userId: extra.userId,
    token: auth.token,
    clientId: auth.clientId,
    scopes: auth.scopes,
  };
}

/**
 * `withMcpAuth` verifier. Returns `AuthInfo` on a valid Supabase JWT, or
 * `undefined` to trigger a 401 with the protected-resource metadata pointer.
 * Identity (`sub`) is stashed in `extra.userId` for downstream tools.
 */
export async function verifyMcpToken(
  _req: Request,
  bearerToken?: string,
): Promise<AuthInfo | undefined> {
  if (!bearerToken) return undefined;
  try {
    const { payload } = await jwtVerify(bearerToken, keySet(), {
      issuer: issuer(),
    });
    const sub = payload.sub;
    if (!sub) return undefined;

    const scope = typeof payload.scope === "string" ? payload.scope : "";
    const clientId =
      (typeof payload.client_id === "string" && payload.client_id) ||
      (typeof payload.azp === "string" && payload.azp) ||
      "unknown";

    return {
      token: bearerToken,
      clientId,
      scopes: scope ? scope.split(" ").filter(Boolean) : [],
      expiresAt: typeof payload.exp === "number" ? payload.exp : undefined,
      extra: { userId: sub },
    } satisfies AuthInfo;
  } catch {
    // Invalid signature / expired / wrong issuer — treat as unauthenticated.
    return undefined;
  }
}

/**
 * Token-bound RLS client. Forwarding the user's bearer JWT means every query
 * runs under that user's RLS policies — the same per-user scoping the app's
 * cookie-bound server client gets. This is the default client for MCP reads
 * and draft writes.
 */
export function createMcpRlsClient(token: string) {
  return createSupabaseClient<Database>(supabaseUrl(), anonKey(), {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export { identityFromAuthInfo };
