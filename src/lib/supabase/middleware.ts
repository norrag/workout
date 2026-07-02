import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

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

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
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

  // do not run code between createServerClient and getUser()
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isPublic =
    pathname === "/" || PUBLIC_PATHS.some((p) => pathname.startsWith(p));

  if (!user && !isPublic) {
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
  if (user && pathname === "/") {
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
