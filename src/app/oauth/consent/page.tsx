import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * OAuth consent screen (Supabase OAuth 2.1 server, Authorization Path
 * `/oauth/consent`). Supabase redirects the user here with an
 * `authorization_id` when an MCP client (e.g. Claude) requests access. We show
 * who is asking and what scopes, then approve/deny via /api/oauth/decision.
 *
 * Identity is the signed-in WORKOUT user; an unauthenticated visitor is sent to
 * sign in and returned here with the authorization_id preserved. Built in the
 * house ledger style (no specific mockup — recorded in PROGRESS).
 */
export default async function ConsentPage({
  searchParams,
}: {
  searchParams: Promise<{ authorization_id?: string }>;
}) {
  const { authorization_id: authorizationId } = await searchParams;

  if (!authorizationId) {
    return (
      <ConsentShell>
        <p className="text-sm text-ink/70">
          Missing authorization request. Start the connection again from your AI
          client.
        </p>
      </ConsentShell>
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(
      `/sign-in?redirect=${encodeURIComponent(
        `/oauth/consent?authorization_id=${authorizationId}`,
      )}`,
    );
  }

  const { data: details, error } =
    await supabase.auth.oauth.getAuthorizationDetails(authorizationId);

  if (error || !details) {
    return (
      <ConsentShell>
        <p className="text-sm text-ink/70">
          {error?.message ?? "This authorization request is invalid or expired."}
        </p>
      </ConsentShell>
    );
  }

  // Already consented (or post-decision) — Supabase returns a redirect target.
  if (!("authorization_id" in details)) {
    redirect(details.redirect_url);
  }

  const scopes = details.scope.split(" ").filter(Boolean);

  return (
    <ConsentShell>
      <div className="text-[10px] font-bold tracking-[0.14em] text-ink/55">
        AUTHORIZE CONNECTION
      </div>
      <h2 className="title-display mt-2 text-[26px]">{details.client.name}</h2>
      <p className="mt-3 text-sm leading-relaxed text-ink/80">
        This application is requesting access to your WORKOUT training data. It
        will act as you, see only your own data, and can never delete logged
        history.
      </p>

      <dl className="mt-5 border-t border-ink/15">
        <Row label="ACCOUNT" value={details.user.email} />
        <Row label="REDIRECT" value={details.redirect_uri} />
      </dl>

      <div className="mt-5">
        <div className="border-b-[1.5px] border-ink pb-1.5 text-[10px] font-bold tracking-[0.14em]">
          REQUESTED ACCESS
        </div>
        {scopes.length > 0 ? (
          <ul className="mt-2">
            {scopes.map((scope) => (
              <li
                key={scope}
                className="flex items-center justify-between border-b border-ink/15 py-2.5 text-sm"
              >
                <span>{scopeLabel(scope)}</span>
                <span className="text-[10px] font-medium tracking-[0.08em] text-ink/45">
                  {scope.toUpperCase()}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-ink/70">
            Access to your training data.
          </p>
        )}
      </div>

      <form action="/api/oauth/decision" method="POST" className="mt-7 flex gap-3">
        <input type="hidden" name="authorization_id" value={authorizationId} />
        <button
          type="submit"
          name="decision"
          value="deny"
          className="flex-1 border-[1.5px] border-ink py-3 text-center text-xs font-bold tracking-[0.12em]"
        >
          DENY
        </button>
        <button
          type="submit"
          name="decision"
          value="approve"
          className="flex-1 bg-ink py-3 text-center text-xs font-bold tracking-[0.12em] text-bg-base"
        >
          APPROVE
        </button>
      </form>
    </ConsentShell>
  );
}

function scopeLabel(scope: string): string {
  switch (scope) {
    case "openid":
      return "Confirm your identity";
    case "email":
      return "Your email address";
    case "profile":
      return "Your basic profile";
    case "phone":
      return "Your phone number";
    default:
      return "Your training data";
  }
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-ink/15 py-2.5">
      <dt className="text-[10px] font-bold tracking-[0.12em] text-ink/55">
        {label}
      </dt>
      <dd className="truncate text-sm">{value}</dd>
    </div>
  );
}

function ConsentShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center px-6 py-12">
      <div className="logotype border-b-[1.5px] border-ink pb-4 text-xl">
        workout
      </div>
      <div className="mt-6">{children}</div>
    </main>
  );
}
