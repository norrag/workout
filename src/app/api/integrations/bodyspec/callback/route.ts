import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import {
  bodyspecClientId,
  bodyspecRedirectUri,
  exchangeCodeForTokens,
  BODYSPEC_PKCE_COOKIE,
  BODYSPEC_STATE_COOKIE,
  BODYSPEC_COOKIE_PATH,
} from "@/lib/bodyspec/oauth";
import { fetchMe, BodySpecApiError } from "@/lib/bodyspec/api";
import { syncBodySpec } from "@/lib/bodyspec/sync";
import {
  saveBodySpecSecrets,
  upsertBodySpecConnection,
} from "@/lib/queries/external-connections";
import { reportError } from "@/lib/observability/report";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The OAuth redirect target (doc 15 §1.1/§8, N34 Phase 5a). Verifies the
 * state round trip, exchanges the code (PKCE), then runs the doc 15 §8.3
 * FIRST-LOGIN VERIFICATION — `GET /users/me` with the fresh token — before
 * persisting anything: if the self-registered client's tokens are rejected
 * by the API (the `ext_api_token` audience residual), the connect fails
 * loudly with its own error state instead of half-connecting. On success:
 * connection row + secrets, then the initial full backfill inline (scans are
 * few; a backfill failure records on the row, it doesn't fail the connect).
 */
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const jar = await cookies();
  const verifier = jar.get(BODYSPEC_PKCE_COOKIE)?.value ?? null;
  const expectedState = jar.get(BODYSPEC_STATE_COOKIE)?.value ?? null;

  const redirect = (params: string) => {
    const res = NextResponse.redirect(
      new URL(`/more/bodyspec${params}`, request.url),
      303,
    );
    // one-shot cookies — always cleared, success or failure
    res.cookies.set(BODYSPEC_PKCE_COOKIE, "", {
      path: BODYSPEC_COOKIE_PATH,
      maxAge: 0,
    });
    res.cookies.set(BODYSPEC_STATE_COOKIE, "", {
      path: BODYSPEC_COOKIE_PATH,
      maxAge: 0,
    });
    return res;
  };

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

  // the user declined at BodySpec (or Keycloak errored)
  if (url.searchParams.get("error")) return redirect("?error=denied");

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state || !verifier || !expectedState || state !== expectedState) {
    return redirect("?error=state");
  }

  const clientId = bodyspecClientId();
  if (!clientId) return redirect("?error=not_configured");

  let tokens;
  try {
    tokens = await exchangeCodeForTokens({
      clientId,
      redirectUri: bodyspecRedirectUri(),
      code,
      codeVerifier: verifier,
    });
  } catch (err) {
    await reportError("bodyspec-token-exchange", err);
    return redirect("?error=exchange");
  }

  // doc 15 §8.3 residual — verify the token is actually accepted by the API
  let identity;
  try {
    identity = await fetchMe(tokens.access_token);
  } catch (err) {
    await reportError("bodyspec-first-login-verification", err);
    const denied =
      err instanceof BodySpecApiError &&
      (err.status === 401 || err.status === 403);
    return redirect(denied ? "?error=api_denied" : "?error=exchange");
  }

  const connection = await upsertBodySpecConnection(supabase, user.id, {
    providerUserId: identity.user_id,
    providerEmail: identity.email ?? null,
  });
  await saveBodySpecSecrets(user.id, connection.id, tokens);

  // initial full backfill (doc 15 §2.3) — outcome lands on the row either way
  const outcome = await syncBodySpec(supabase, user.id);
  return redirect(
    outcome.error ? "?connected=1" : `?connected=1&imported=${outcome.imported}`,
  );
}
