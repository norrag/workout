import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { Suspense } from "react";
import { Splash } from "@/components/ui/Splash";
import {
  IOS_LAUNCH_SCREENS,
  launchImageHref,
  launchImageMedia,
} from "@/lib/pwa/ios-launch-screens";
import "@/styles/globals.css";

const archivo = localFont({
  src: "./fonts/archivo-latin-variable.woff2",
  weight: "100 900",
  display: "swap",
  variable: "--font-archivo",
});

export const metadata: Metadata = {
  title: "workout",
  description: "Periodized workout tracking with RIR-based progression",
  // PATH-versioned so iOS re-reads the manifest on the next add-to-home-screen
  // instead of installing from a stale cached copy. iOS caches the manifest and
  // binds the standalone `scope` at install time; the cache survives deleting
  // the home-screen icon, so a re-add can silently reuse a pre-fix manifest and
  // keep opening non-/workout routes in the in-app browser. A query-string bust
  // (?v=2) proved unreliable — caches may normalize/strip queries — so version
  // the *pathname*. To change any install-time field (scope / start_url / id /
  // display): bump this to manifest-v4.webmanifest, add the new file, and KEEP
  // the old file in place (stale cached HTML still requests it; a 404 there
  // makes iOS fall back to no-manifest legacy mode, which is worse). `id` stays
  // "/" in every version so re-adds update the same app, not a duplicate.
  // The guard test (src/lib/pwa/__tests__/manifest.test.ts) enforces all of
  // this: link resolves to a real file, all manifest copies stay identical.
  manifest: "/manifest-v3.webmanifest",
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/icon-180.png", sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "workout",
  },
  // Next 15 emits only the standard `mobile-web-app-capable`; iOS < 16.4 (and
  // WebKit's legacy standalone path) still keys off `apple-mobile-web-app-capable`,
  // so emit it explicitly to keep the app installing standalone everywhere.
  other: {
    "apple-mobile-web-app-capable": "yes",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F4F0E6" },
    { media: "(prefers-color-scheme: dark)", color: "#14110C" },
  ],
  width: "device-width",
  initialScale: 1,
  // Owner ruling (2026-07-02, PR #100): keep the zoom cap — this is an
  // installed PWA and pinch-zoom breaks the native feel. Do not remove for
  // WCAG 1.4.4 without a new owner decision (R18 flagged it; ruled against).
  maximumScale: 1,
  viewportFit: "cover",
};

// Applies the saved theme to <html> before first paint so there's no flash of
// the wrong palette. Default is "system" (follows the OS preference).
const themeInit = `(function(){try{var t=localStorage.getItem("theme")||"system";document.documentElement.dataset.theme=t;}catch(e){document.documentElement.dataset.theme="system";}})();`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={archivo.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
        {/* iOS PWA launch screens — replace the OS pre-document blank (which
            ignores the manifest bg) with the brand background so a home-screen
            launch never flashes black. See lib/pwa/ios-launch-screens.ts. */}
        {IOS_LAUNCH_SCREENS.flatMap((s) =>
          (["light", "dark"] as const).map((theme) => (
            <link
              key={`${s.w}x${s.h}@${s.dpr}-${theme}`}
              rel="apple-touch-startup-image"
              href={launchImageHref(s, theme)}
              media={launchImageMedia(s, theme)}
            />
          )),
        )}
      </head>
      <body className="min-h-dvh bg-bg-base text-ink">
        {/* Stream a branded splash from the first byte so a cold load never shows
            a blank/black viewport while the `(app)` layout's auth check + the
            page data resolve (perf WS-J). Only the initial/hard load hits this;
            soft tab navigations are handled by per-route loading.tsx. */}
        <Suspense fallback={<Splash />}>{children}</Suspense>
      </body>
    </html>
  );
}
