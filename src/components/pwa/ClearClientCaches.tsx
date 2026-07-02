"use client";

import { useEffect } from "react";

/**
 * Purges service-worker runtime caches and the session's workout pointer when
 * an auth screen mounts (R7). Sign-out redirects to /sign-in, as do expired
 * sessions and a shared device's next user — the one choke point where the
 * previous user's cached responses must not survive. Runtime caching is
 * already trimmed to static assets (sw.ts), so this mainly clears caches left
 * by earlier service-worker versions and backstops future regressions.
 *
 * The precache is spared: it holds only build assets plus the /~offline
 * fallback document, and deleting it would break the offline interstitial.
 */
export function ClearClientCaches() {
  useEffect(() => {
    sessionStorage.removeItem("lastWorkoutId");
    if ("caches" in window) {
      void caches.keys().then((keys) =>
        Promise.all(
          keys
            .filter((key) => !key.includes("precache"))
            .map((key) => caches.delete(key)),
        ),
      );
    }
  }, []);
  return null;
}
