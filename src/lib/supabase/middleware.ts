import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { supabasePublicEnv } from "@/lib/env";

const PUBLIC_PATHS = [
  "/sign-in",
  "/sign-up",
  "/auth",
  "/manifest.webmanifest",
  "/icons",
  "/sw.js",
  // MCP resource server + its discovery metadata authenticate via bearer token,
  // not the app's auth cookie — never redirect them to /sign-in (05 §Auth).
  "/api/mcp",
  "/.well-known/oauth-protected-resource",
  // OAuth consent screen + decision handler: these manage their own auth and
  // must preserve the `authorization_id` through sign-in rather than being
  // blanket-redirected to /sign-in by the middleware.
  "/oauth/consent",
  "/api/oauth/decision",
  // BodySpec OAuth round trip (doc 15 §8.5): the callback must complete in a
  // browsing context that holds NO app session (the installed-PWA in-app
  // sheet) — it authenticates by the single-use server-side transaction, and
  // a redirect-to-/sign-in here would dead-end the flow the moment BodySpec
  // sends the user back. The connect route handles its own signed-out case
  // (preserving ?redirect=/more/bodyspec, which a blanket bounce would drop).
  "/api/integrations/bodyspec",
  // Client error intake (R20): the (auth) + root error boundaries must be able
  // to report a crash from a signed-out state. Same-origin-guarded + zod-capped
  // in the route itself; a redirect-to-/sign-in here would eat every report.
  "/api/client-error",
  // Offline fallback (R7): the service worker precaches this document at
  // install time; a redirect-to-/sign-in would poison the cached fallback.
  "/~offline",
];

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const { url: supabaseUrl, anonKey } = supabasePublicEnv();
  const supabase = createServerClient(
    supabaseUrl,
    anonKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // do not run code between createServerClient and getSession()
  //
  // getSession(), not getUser() (N53): getUser() is a network round-trip to
  // Supabase, and the middleware runs before a single byte of HTML can stream
  // — it put a full auth RTT of pure black screen in front of every cold PWA
  // launch, ahead of any splash the document could paint. getSession() parses
  // the auth cookie with NO network call while the access token is valid, and
  // when it has expired it refreshes on demand through the refresh token
  // (writing the new cookies via setAll above), so session maintenance still
  // happens exactly where Server Components can't do it. The trade-off: the
  // session is asserted by the client-held JWT, not verified against Supabase.
  // That is safe HERE because middleware only makes routing decisions on its
  // *presence* — every (app) layout/page re-checks with a verified
  // auth.getUser() and redirects, and all data access is RLS-scoped. A forged
  // cookie buys an HTML shell that immediately bounces to /sign-in, never data.
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const { pathname } = request.nextUrl;
  const isPublic =
    pathname === "/" || PUBLIC_PATHS.some((p) => pathname.startsWith(p));

  if (!session && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/sign-in";
    return NextResponse.redirect(url);
  }

  // Signed-in users get the Workout tab AT "/" — a rewrite, not a redirect,
  // so the address stays "/". iOS 26.5 scopes an installed web app to the page
  // it was added from (the manifest `scope` member is not honored), and a
  // signed-in user could historically only ever add from /workout because "/"
  // redirected there — scoping the app to /workout and opening every other
  // route in the in-app browser. With the app living at "/", the added-from
  // page, manifest start_url, and scope all agree on "/" under every scope
  // derivation iOS uses. Do not turn this back into a redirect.
  if (session && pathname === "/") {
    const url = request.nextUrl.clone();
    url.pathname = "/workout";
    const rewritten = NextResponse.rewrite(url, { request });
    for (const cookie of supabaseResponse.cookies.getAll()) {
      rewritten.cookies.set(cookie);
    }
    return rewritten;
  }

  return supabaseResponse;
}
