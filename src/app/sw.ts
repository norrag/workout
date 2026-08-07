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

// R7: runtime caching is limited to immutable/static assets. Serwist's
// `defaultCache` NetworkFirst-cached same-origin documents, RSC payloads, and
// /api/ GETs for ~24h, which (a) silently served day-old prescriptions when
// the network dropped — the app is online-only by design (hard rule #9) and
// nothing marked the view stale — and (b) kept the previous user's rendered
// pages in CacheStorage after sign-out on a shared device (the auth screens
// purge leftovers; see ClearClientCaches). Anything not matched below goes to
// the network every time; offline navigations get the precached /~offline
// interstitial instead of stale content.
const staticAssetCaching: RuntimeCaching[] = [
  {
    // Hashed build assets (JS/CSS/self-hosted fonts) — immutable by URL.
    matcher: /\/_next\/static\/.+/i,
    handler: new CacheFirst({
      cacheName: "next-static-assets",
      plugins: [
        new ExpirationPlugin({
          maxEntries: 96,
          maxAgeSeconds: 30 * 24 * 60 * 60, // 30 days
          maxAgeFrom: "last-used",
        }),
      ],
    }),
  },
  {
    // Manual figures (doc 22 D3 / 09-changelog 2026-08-08 §5). Their own cache,
    // ahead of the general image rule, because the app-chrome cache below is
    // capped at 64 entries shared with the icons and splash screens — a
    // figure-heavy chapter read once would quietly evict app chrome, which is
    // exactly the "the manual degraded the app" outcome D3's condition exists
    // to prevent. Cache-on-read, never precached (next.config.ts globIgnores).
    matcher: ({ sameOrigin, url }) =>
      sameOrigin && url.pathname.startsWith("/manual/"),
    handler: new CacheFirst({
      cacheName: "manual-figures",
      plugins: [
        new ExpirationPlugin({
          maxEntries: 32,
          maxAgeSeconds: 30 * 24 * 60 * 60, // 30 days
          maxAgeFrom: "last-used",
        }),
      ],
    }),
  },
  {
    // Same-origin static images (app icons, iOS splash screens).
    matcher: ({ sameOrigin, url }) =>
      sameOrigin && /\.(?:jpg|jpeg|gif|png|svg|ico|webp)$/i.test(url.pathname),
    handler: new StaleWhileRevalidate({
      cacheName: "static-image-assets",
      plugins: [
        new ExpirationPlugin({
          maxEntries: 64,
          maxAgeSeconds: 30 * 24 * 60 * 60, // 30 days
          maxAgeFrom: "last-used",
        }),
      ],
    }),
  },
  {
    // Everything else — documents, RSC payloads, /api/, cross-origin — is
    // never cached. The explicit route (vs. no route at all) makes the
    // intent auditable and gives the offline fallback a Strategy to hook.
    matcher: /.*/i,
    method: "GET",
    handler: new NetworkOnly(),
  },
];

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: staticAssetCaching,
  fallbacks: {
    // /~offline is precached via `additionalPrecacheEntries` (next.config.ts).
    entries: [
      {
        url: "/~offline",
        matcher({ request }) {
          return request.destination === "document";
        },
      },
    ],
  },
});

serwist.addEventListeners();
