import "server-only";
import { z } from "zod";
import { resolveOrigin } from "@/app/(app)/more/connector/endpoint";
import { tokenSetSchema, type BodySpecTokenSet } from "./schemas";

/**
 * BodySpec OIDC endpoints + PKCE helpers (doc 15 §1.1/§8). The realm is
 * Keycloak; WORKOUT is a PUBLIC client (`token_endpoint_auth_method: none`,
 * PKCE S256) self-registered per environment via dynamic client registration
 * (doc 15 §8.1 — `scripts/register-bodyspec-client.ts`, recorded in
 * `docs/deployment/manual-operations.md`). `offline_access` is requested so
 * "sync" works without a re-login (§8.2); expiry still degrades to a cheap
 * reconnect path, never a broken screen.
 */

export const BODYSPEC_REALM = "https://auth.bodyspec.com/realms/bodyspec";
export const BODYSPEC_API_BASE = "https://app.bodyspec.com";
export const BODYSPEC_AUTHORIZATION_ENDPOINT = `${BODYSPEC_REALM}/protocol/openid-connect/auth`;
export const BODYSPEC_TOKEN_ENDPOINT = `${BODYSPEC_REALM}/protocol/openid-connect/token`;
export const BODYSPEC_REVOCATION_ENDPOINT = `${BODYSPEC_REALM}/protocol/openid-connect/revoke`;
export const BODYSPEC_SCOPES = "openid profile email offline_access";

/** The per-environment client id from dynamic registration. Null ⇒ the
 *  integration is not configured here (the screen says so; connect refuses). */
export function bodyspecClientId(): string | null {
  const value = process.env.BODYSPEC_CLIENT_ID;
  return value && value.length > 0 ? value : null;
}

/** The environment's registered redirect URI. Same durable-origin resolution
 *  as the connector endpoint (localhost in dev via NEXT_PUBLIC_APP_URL; the
 *  canonical domain on prod — preview aliases rotate and are never
 *  registered). Must byte-match what the registration script registered. */
export function bodyspecRedirectUri(): string {
  return `${resolveOrigin(process.env.NEXT_PUBLIC_APP_URL)}/api/integrations/bodyspec/callback`;
}

function base64url(bytes: Uint8Array): string {
  return Buffer.from(bytes)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** 32 bytes of URL-safe entropy (43 chars) — verifier and state material. */
export function randomUrlSafe(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return base64url(bytes);
}

/** RFC 7636 S256: BASE64URL(SHA256(verifier)). */
export async function pkceChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(verifier),
  );
  return base64url(new Uint8Array(digest));
}

export function buildAuthorizationUrl(input: {
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
}): string {
  const url = new URL(BODYSPEC_AUTHORIZATION_ENDPOINT);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", input.clientId);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("scope", BODYSPEC_SCOPES);
  url.searchParams.set("state", input.state);
  url.searchParams.set("code_challenge", input.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

const tokenErrorSchema = z.object({
  error: z.string(),
  error_description: z.string().optional(),
});

/** Thrown when the refresh grant is dead (revoked/expired) — the caller marks
 *  the connection `error` and the screen offers RECONNECT. */
export class BodySpecReconnectRequired extends Error {
  constructor(detail: string) {
    super(`BodySpec connection needs a reconnect: ${detail}`);
    this.name = "BodySpecReconnectRequired";
  }
}

async function postToken(
  params: Record<string, string>,
): Promise<BodySpecTokenSet> {
  const res = await fetch(BODYSPEC_TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params).toString(),
    cache: "no-store",
  });
  const json: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const parsed = tokenErrorSchema.safeParse(json);
    const detail = parsed.success
      ? `${parsed.data.error}${parsed.data.error_description ? ` — ${parsed.data.error_description}` : ""}`
      : `HTTP ${res.status}`;
    // invalid_grant = the refresh token is dead; anything else is transient
    if (parsed.success && parsed.data.error === "invalid_grant") {
      throw new BodySpecReconnectRequired(detail);
    }
    throw new Error(`BodySpec token endpoint: ${detail}`);
  }
  return tokenSetSchema.parse(json);
}

export async function exchangeCodeForTokens(input: {
  clientId: string;
  redirectUri: string;
  code: string;
  codeVerifier: string;
}): Promise<BodySpecTokenSet> {
  return postToken({
    grant_type: "authorization_code",
    client_id: input.clientId,
    redirect_uri: input.redirectUri,
    code: input.code,
    code_verifier: input.codeVerifier,
  });
}

export async function refreshTokens(input: {
  clientId: string;
  refreshToken: string;
}): Promise<BodySpecTokenSet> {
  return postToken({
    grant_type: "refresh_token",
    client_id: input.clientId,
    refresh_token: input.refreshToken,
  });
}

/** Best-effort provider-side revocation on disconnect. Failure is swallowed —
 *  local token destruction is the guarantee; revocation is courtesy. */
export async function revokeToken(input: {
  clientId: string;
  token: string;
}): Promise<void> {
  try {
    await fetch(BODYSPEC_REVOCATION_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: input.clientId,
        token: input.token,
      }).toString(),
      cache: "no-store",
    });
  } catch {
    // unreachable revocation endpoint must not block a disconnect
  }
}
