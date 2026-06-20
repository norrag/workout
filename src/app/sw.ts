import type { PrecacheEntry, RuntimeCaching, SerwistGlobalConfig } from "serwist";
import {
  CacheFirst,
  ExpirationPlugin,
  NetworkOnly,
  Serwist,
  StaleWhileRevalidate,
} from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

/**
 * Runtime caching is deliberately STATIC-ONLY.
 *
 * WORKOUT is online-only with no offline sync (CLAUDE.md hard rule #9) and every
 * row is RLS-scoped to the signed-in user. Serwist's `defaultCache` ships a
 * `NetworkFirst` cache for same-origin navigations (RSC/HTML) and GET `/api/*`
 * responses, which would persist one account's rendered pages and JSON for 24h —
 * after a logout→login on the same device the SW could serve the previous user's
 * cached screens, and could serve workout state that's 24h stale. There is
 * nothing to gain (no offline mode) and real correctness/privacy risk, so we
 * cache only immutable, non-personal static assets and send everything dynamic
 * straight to the network.
 */
const runtimeCaching: RuntimeCaching[] = [
  {
    // Content-hashed Next.js build output — immutable, safe to cache long.
    matcher: ({ url, sameOrigin }) =>
      sameOrigin && url.pathname.startsWith("/_next/static/"),
    handler: new CacheFirst({
      cacheName: "next-static",
      plugins: [
        new ExpirationPlugin({
          maxEntries: 256,
          maxAgeSeconds: 30 * 24 * 60 * 60,
          maxAgeFrom: "last-used",
        }),
      ],
    }),
  },
  {
    // Self-hosted font + static icons/images (manifest icons, og art). Not
    // user-specific. SWR keeps them fresh without blocking first paint.
    matcher: ({ request, sameOrigin }) =>
      sameOrigin &&
      (request.destination === "font" || request.destination === "image"),
    handler: new StaleWhileRevalidate({
      cacheName: "static-assets",
      plugins: [
        new ExpirationPlugin({ maxEntries: 64, maxAgeSeconds: 30 * 24 * 60 * 60 }),
      ],
    }),
  },
  {
    // Navigations (RSC + HTML): network-only, consuming the navigation preload.
    // Never cached so auth state and logged data are always live.
    matcher: ({ request }) => request.mode === "navigate",
    handler: new NetworkOnly(),
  },
];

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  // Note: no catch-all entry — unmatched requests (notably `/api/*`, including
  // `/api/mcp` and `/.well-known/*`) fall through to the network uncached.
  runtimeCaching,
});

serwist.addEventListeners();
