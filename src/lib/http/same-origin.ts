/**
 * Same-origin check for CSRF defense on plain route handlers.
 *
 * Next.js Server Actions reject cross-origin POSTs automatically, but route
 * handlers (`route.ts`) do not. Any cookie-authenticated, state-changing route
 * handler must guard itself — otherwise a forged cross-site auto-submit can ride
 * the victim's session cookies.
 *
 * Browsers always send `Sec-Fetch-Site` on form posts, so we trust it first and
 * fall back to comparing `Origin` against the request host. A request with
 * neither header is a non-browser client, which cannot carry a victim's cookies,
 * so it passes — CSRF necessarily originates from a browser, which is caught.
 */
export function isSameOrigin(
  request: Request,
  hostHeader: string | null,
): boolean {
  const secFetchSite = request.headers.get("sec-fetch-site");
  if (secFetchSite) {
    return secFetchSite !== "cross-site";
  }
  const origin = request.headers.get("origin");
  if (origin) {
    try {
      return !!hostHeader && new URL(origin).host === hostHeader;
    } catch {
      return false;
    }
  }
  return true;
}
