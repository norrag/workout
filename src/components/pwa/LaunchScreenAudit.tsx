"use client";

import { useEffect } from "react";
import { postClientError } from "@/lib/observability/post-client-error";
import { IOS_LAUNCH_SCREENS } from "@/lib/pwa/ios-launch-screens";

/**
 * Detects the silent failure mode behind N53: iOS only replaces the
 * pre-document black launch window when an `apple-touch-startup-image` media
 * query matches the device EXACTLY, so a device class missing from
 * `ios-launch-screens.ts` (a new iPhone, a changed CSS viewport after an iOS
 * update) degrades to a black launch with no signal anywhere. On an installed
 * iPhone launch, compare the device's real CSS dims/dpr against the class
 * list and report a miss — once per device class — through the R20 client
 * error funnel, where it becomes a Sentry event instead of a vague "the app
 * flashes black" report months later.
 */
export function LaunchScreenAudit() {
  useEffect(() => {
    try {
      // Only the installed-PWA surface gets startup images, and the class
      // list is iPhone-only (iPad is out of scope).
      const standalone =
        window.matchMedia("(display-mode: standalone)").matches ||
        ("standalone" in navigator &&
          (navigator as { standalone?: boolean }).standalone === true);
      if (!standalone || !/iPhone|iPod/.test(navigator.userAgent)) return;

      // screen.* is the portrait CSS size iOS matches launch images against;
      // normalize orientation defensively (the class list is portrait-only).
      const w = Math.min(screen.width, screen.height);
      const h = Math.max(screen.width, screen.height);
      const dpr = window.devicePixelRatio;
      if (
        IOS_LAUNCH_SCREENS.some(
          (s) => s.w === w && s.h === h && s.dpr === dpr,
        )
      ) {
        return;
      }

      const key = `launch-screen-audit:${w}x${h}@${dpr}`;
      if (localStorage.getItem(key)) return;
      localStorage.setItem(key, new Date().toISOString());
      postClientError({
        boundary: "launch",
        message:
          `no iOS launch-screen class matches this device (${w}x${h}@${dpr}) — ` +
          `cold launches fall back to the OS-default black; add the class to ` +
          `src/lib/pwa/ios-launch-screens.ts and regenerate (N53)`,
        path: window.location.pathname,
      });
    } catch {
      // diagnostics only — must never affect the app
    }
  }, []);
  return null;
}
