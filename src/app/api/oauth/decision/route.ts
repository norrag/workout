import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Handles the OAuth consent decision (Supabase OAuth 2.1 server). The consent
 * page (`/oauth/consent`) posts the user's approve/deny here; we call Supabase
 * which mints the authorization code and returns the client redirect URL.
 * Runs as the signed-in user (cookie session) — no `user_id` is trusted.
 */
export async function POST(request: Request): Promise<Response> {
  const formData = await request.formData();
  const decision = formData.get("decision");
  const authorizationId = formData.get("authorization_id");

  if (typeof authorizationId !== "string" || !authorizationId) {
    return NextResponse.json(
      { error: "Missing authorization_id" },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    // Session expired mid-flow — send back to sign in, returning to consent.
    // 303 so the browser issues a GET to the sign-in page (this is a POST).
    return NextResponse.redirect(
      new URL(
        `/sign-in?redirect=${encodeURIComponent(
          `/oauth/consent?authorization_id=${authorizationId}`,
        )}`,
        request.url,
      ),
      303,
    );
  }

  const { data, error } =
    decision === "approve"
      ? await supabase.auth.oauth.approveAuthorization(authorizationId)
      : await supabase.auth.oauth.denyAuthorization(authorizationId);

  if (error || !data) {
    return NextResponse.json(
      { error: error?.message ?? "Authorization failed" },
      { status: 400 },
    );
  }

  // 303 See Other: this handler is reached by POST (the consent form), but the
  // OAuth client's redirect_uri callback expects a GET. 303 forces the method
  // to GET; the default (307) would replay the POST and the client returns
  // "Method Not Allowed".
  return NextResponse.redirect(data.redirect_url, 303);
}
