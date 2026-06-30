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
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default withAnalyzer(withSerwist(nextConfig));
