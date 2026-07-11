import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import {
  bodyspecClientId,
  bodyspecRedirectUri,
  exchangeCodeForTokens,
} from "@/lib/bodyspec/oauth";
import { fetchMe, BodySpecApiError } from "@/lib/bodyspec/api";
import { syncBodySpec } from "@/lib/bodyspec/sync";
import {
  saveBodySpecSecrets,
  upsertBodySpecConnection,
} from "@/lib/queries/external-connections";
import { consumeBodySpecOAuthTransaction } from "@/lib/queries/oauth-transactions";
import { reportError } from "@/lib/observability/report";
import { flashLine } from "@/app/(app)/more/bodyspec/flash";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Outcome = {
  connected?: string;
  imported?: string;
  error?: string;
};

/**
 * The OAuth redirect target (doc 15 §1.1/§8, N34 Phase 5a; reworked per
 * §8.5). The round trip is verified against the server-side transaction the
 * /connect route wrote — NOT cookies, and NOT this context's session: from
 * the installed PWA, iOS runs the whole provider flow in an in-app browser
 * sheet whose cookie jar is separate from the app's, so this handler must be
 * able to complete with nothing but the query string. The transaction is
 * consumed single-use by `state` and pins the user who STARTED the flow;
 * everything persists through service-role call sites scoped to that id
 * (hard rule 4).
 *
 * Then the doc 15 §8.3 FIRST-LOGIN VERIFICATION — `GET /users/me` with the
 * fresh token — runs before persisting anything: if the self-registered
 * client's tokens are rejected by the API (the `ext_api_token` audience
 * residual), the connect fails loudly with its own error state instead of
 * half-connecting. On success: connection row + secrets, then the initial
 * full backfill inline (scans are few; a backfill failure records on the
 * row, it doesn't fail the connect).
 *
 * The response adapts to where it lands: a context holding the initiating
 * user's app session (desktop/same-tab flow) gets the original redirect to
 * /more/bodyspec with the flash params; any other context (the sheet) gets
 * the same outcome rendered as a return-to-app page.
 */
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const state = url.searchParams.get("state");
  // consume unconditionally (even on a provider error) — a declined or
  // broken flow must still burn its transaction
  const tx = state ? await consumeBodySpecOAuthTransaction(state) : null;

  const finish = async (outcome: Outcome): Promise<Response> => {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    // redirect only into the session of the user the outcome belongs to;
    // a session-less sheet (or a different signed-in account) gets the page
    if (user && (tx === null || user.id === tx.userId)) {
      const params = new URLSearchParams(
        Object.entries(outcome).filter(([, v]) => v !== undefined),
      ).toString();
      return NextResponse.redirect(
        new URL(`/more/bodyspec${params ? `?${params}` : ""}`, request.url),
        303,
      );
    }
    return returnToAppPage(outcome);
  };

  // the user declined at BodySpec (or Keycloak errored)
  if (url.searchParams.get("error")) return finish({ error: "denied" });

  const code = url.searchParams.get("code");
  if (!code || !tx) return finish({ error: "state" });

  const clientId = bodyspecClientId();
  if (!clientId) return finish({ error: "not_configured" });

  let tokens;
  try {
    tokens = await exchangeCodeForTokens({
      clientId,
      redirectUri: bodyspecRedirectUri(),
      code,
      codeVerifier: tx.codeVerifier,
    });
  } catch (err) {
    await reportError("bodyspec-token-exchange", err);
    return finish({ error: "exchange" });
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
    return finish({ error: denied ? "api_denied" : "exchange" });
  }

  // service-role persistence, scoped to the transaction's user — this
  // context may hold no session at all (doc 15 §8.5)
  const service = createServiceClient();
  const connection = await upsertBodySpecConnection(service, tx.userId, {
    providerUserId: identity.user_id,
    providerEmail: identity.email ?? null,
  });
  await saveBodySpecSecrets(tx.userId, connection.id, tokens);

  // initial full backfill (doc 15 §2.3) — outcome lands on the row either way
  const outcome = await syncBodySpec(service, tx.userId);
  return finish(
    outcome.error
      ? { connected: "1" }
      : { connected: "1", imported: String(outcome.imported) },
  );
}

/**
 * The return-to-app interstitial (doc 15 §8.5; 09-changelog 2026-07-11 —
 * house-style, no mockup figure exists). Rendered when the callback lands in
 * a browsing context without the initiating user's session — in practice the
 * installed PWA's in-app browser sheet, which the user simply closes. Plain
 * HTML with the design tokens inlined: this response exists outside the app
 * shell (no session, no layout), and it must never trigger a sign-in bounce.
 */
function returnToAppPage(outcome: Outcome): Response {
  const ok = outcome.connected !== undefined;
  const title = ok ? "bodyspec connected" : "connection not completed";
  const line =
    flashLine(outcome, null) ??
    "The sign-in round trip didn't verify. Try connecting again.";
  const note = ok
    ? "This window opened outside the app. Close it and return to workout — the connection is saved to your account."
    : "This window opened outside the app. Close it, return to workout, and try again from the BodySpec screen.";
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>workout — bodyspec</title>
<style>
  body { margin: 0; background: #F4F0E6; color: #17140F;
    font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; }
  main { max-width: 26rem; margin: 0 auto; padding: 56px 24px; }
  .logotype { font-size: 13px; font-weight: 600; letter-spacing: -0.01em; }
  h1 { margin: 20px 0 0; font-size: 32px; line-height: 1.05; font-weight: 600;
    letter-spacing: -0.02em; }
  .flash { margin-top: 24px; border: 1.5px solid #17140F; padding: 12px;
    font-size: 14px; line-height: 1.55; }
  .note { margin-top: 16px; font-size: 14px; line-height: 1.55;
    color: rgba(23, 20, 15, 0.8); }
  a.return { display: block; margin-top: 28px; border: 1.5px solid #17140F;
    padding: 12px; text-align: center; font-size: 12px; font-weight: 700;
    letter-spacing: 0.12em; color: #17140F; text-decoration: none; }
</style>
</head>
<body>
<main>
  <div class="logotype">workout</div>
  <h1>${title}</h1>
  <div class="flash">${line}</div>
  <p class="note">${note}</p>
  <a class="return" href="/more/bodyspec">OPEN WORKOUT</a>
</main>
</body>
</html>
`;
  return new Response(html, {
    status: ok ? 200 : 400,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
