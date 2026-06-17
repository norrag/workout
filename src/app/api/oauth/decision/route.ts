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
    return NextResponse.redirect(
      new URL(
        `/sign-in?redirect=${encodeURIComponent(
          `/oauth/consent?authorization_id=${authorizationId}`,
        )}`,
        request.url,
      ),
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

  return NextResponse.redirect(data.redirect_url);
}
