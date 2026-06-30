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
  manifest: "/manifest.webmanifest",
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
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F4F0E6" },
    { media: "(prefers-color-scheme: dark)", color: "#14110C" },
  ],
  width: "device-width",
  initialScale: 1,
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
