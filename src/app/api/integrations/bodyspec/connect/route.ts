import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  bodyspecClientId,
  bodyspecRedirectUri,
  buildAuthorizationUrl,
  pkceChallenge,
  randomUrlSafe,
} from "@/lib/bodyspec/oauth";
import { createBodySpecOAuthTransaction } from "@/lib/queries/oauth-transactions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Start the BodySpec OAuth flow (doc 15 §1.1/§8, N34 Phase 5a):
 * authorization-code + PKCE S256 against the Keycloak realm, requesting
 * `offline_access` so sync works between visits. The verifier and state ride
 * a server-side `oauth_transactions` row, NOT cookies (doc 15 §8.5): from
 * the installed PWA, iOS runs the provider login — and the redirect back —
 * in an in-app browser sheet whose cookie jar is separate from the app's,
 * so the callback must be able to complete the round trip cookie-free. The
 * user id is bound to the transaction here, while this context still has
 * the session; nothing is written to the connection tables until the
 * callback verifies the round trip.
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
  await createBodySpecOAuthTransaction({
    userId: user.id,
    state,
    codeVerifier: verifier,
  });

  const authorizationUrl = buildAuthorizationUrl({
    clientId,
    redirectUri: bodyspecRedirectUri(),
    state,
    codeChallenge: await pkceChallenge(verifier),
  });
  return NextResponse.redirect(authorizationUrl, 303);
}
