import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  bodyspecClientId,
  bodyspecRedirectUri,
  buildAuthorizationUrl,
  pkceChallenge,
  randomUrlSafe,
  BODYSPEC_PKCE_COOKIE,
  BODYSPEC_STATE_COOKIE,
  BODYSPEC_COOKIE_PATH,
} from "@/lib/bodyspec/oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COOKIE_TTL_SECONDS = 600;

/**
 * Start the BodySpec OAuth flow (doc 15 §1.1/§8, N34 Phase 5a):
 * authorization-code + PKCE S256 against the Keycloak realm, requesting
 * `offline_access` so sync works between visits. The verifier and state ride
 * short-lived httpOnly cookies (`lax` — they must survive the top-level
 * redirect back). A GET that only sets cookies and redirects; nothing is
 * written until the callback verifies the round trip.
 */
export async function GET(request: Request): Promise<Response> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(
      new URL("/sign-in?redirect=/more/bodyspec", request.url),
      303,
    );
  }

  const clientId = bodyspecClientId();
  if (!clientId) {
    return NextResponse.redirect(
      new URL("/more/bodyspec?error=not_configured", request.url),
      303,
    );
  }

  const verifier = randomUrlSafe();
  const state = randomUrlSafe();
  const authorizationUrl = buildAuthorizationUrl({
    clientId,
    redirectUri: bodyspecRedirectUri(),
    state,
    codeChallenge: await pkceChallenge(verifier),
  });

  const res = NextResponse.redirect(authorizationUrl, 303);
  const cookie = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: BODYSPEC_COOKIE_PATH,
    maxAge: COOKIE_TTL_SECONDS,
  };
  res.cookies.set(BODYSPEC_PKCE_COOKIE, verifier, cookie);
  res.cookies.set(BODYSPEC_STATE_COOKIE, state, cookie);
  return res;
}
