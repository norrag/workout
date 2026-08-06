import type { Release } from "./types";

/**
 * doc 23 §4.3 / O8 — the framework itself, plus the pre-release app declared
 * production. One entry, and **no modal**: every existing account is backfilled
 * to `1.0.0` by the migration that adds `profiles.last_seen_version`, so the
 * first What's New anyone ever sees is 1.1.0. Building the notification inside
 * 1.0.0 is deliberate — the first notified release must not also be the release
 * that debuts the notification.
 *
 * O8: one line. A changelog of the pre-release period has no reader.
 */
export const RELEASE_1_0_0: Release = {
  version: "1.0.0",
  date: "2026-08-06",
  kind: "major",
  headline: "Version 1.0",
  entries: [
    {
      id: "1.0.0-production",
      title: "First production release",
      body: "The app leaves its pre-release period. From here, every change ships as a numbered release — you can read what changed, and when, under More.",
      area: "app",
      link: { label: "Version history", target: { kind: "app", href: "/more/whats-new" } },
    },
  ],
};
