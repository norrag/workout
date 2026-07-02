import type { NextConfig } from "next";
import withSerwistInit from "@serwist/next";
import withBundleAnalyzer from "@next/bundle-analyzer";

// Bundle analyzer (perf Phase 0 — `docs/notes/J-performance.md`). Inert unless
// ANALYZE=true, so it never affects normal/CI builds: `ANALYZE=true npm run build`
// writes the per-route client/server treemaps under `.next/analyze/`.
const withAnalyzer = withBundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
});

const withSerwist = withSerwistInit({
  swSrc: "src/app/sw.ts",
  swDest: "public/sw.js",
  disable: process.env.NODE_ENV === "development",
  // R7: the offline interstitial must be in the precache for sw.ts's document
  // fallback to serve it. A fresh revision each build re-fetches it (its HTML
  // references build-hashed assets).
  additionalPrecacheEntries: [
    { url: "/~offline", revision: crypto.randomUUID() },
  ],
});

// Security headers applied to every response (07 Phase 7 — security pass).
// HSTS is safe: the app is HTTPS-only on Vercel. No full CSP yet (Next's inline
// runtime needs nonces to do it without breakage); frame-ancestors via
// X-Frame-Options + a frame-ancestors CSP directive covers clickjacking.
const securityHeaders = [
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  experimental: {
    // Client Router Cache (WS-J). Default for dynamic routes is 0, so returning
    // to a tab refetches the whole RSC payload every time. A positive `dynamic`
    // window serves the already-rendered segment from the client cache on
    // return — instant, with scroll position restored, no server round-trip —
    // which is the "switch back to where I was" behavior the owner wants. 120s
    // (owner-chosen "balanced"): own edits still bust the cache via
    // revalidatePath, so only rare out-of-band prescription changes can be briefly
    // stale, and they self-heal on the next cold load.
    staleTimes: { dynamic: 120, static: 300 },
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default withAnalyzer(withSerwist(nextConfig));
