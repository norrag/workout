import type { ReleaseEntry } from "./types";

/**
 * doc 23 §9.2/§9.3 — the staged manifest.
 *
 * Ordinary PRs append user-visible changes here. A release PR moves the
 * completed block into `<version>.ts`, then leaves this array empty and moves
 * `UNRELEASED_VERSION` to the next feature version.
 */
export const UNRELEASED_ENTRIES: ReleaseEntry[] = [
  {
    id: "plate-loader",
    title: "Work out what goes on the bar",
    body: "If you are not sure which plates add up to your target weight, this works it out for you. Open Load plates from an exercise's menu, and it shows you what to put on each side.",
    area: "training",
    highlight: true,
    media: {
      src: "/releases/1.2.0/load-plates.gif",
      alt: "On a Barbell Hip Thrust set, the exercise menu opens and Load plates is tapped. A tray rises carrying the set's 287.5 lb; swiping past a 45 lb bar loaded at both ends reaches the answer — two 45s, a 25 and a 5 a side, making 285 lb.",
      width: 480,
      height: 670,
    },
    link: {
      label: "Open your workout",
      target: { kind: "app", href: "/workout" },
    },
  },
];

/** The next feature release under construction. */
export const UNRELEASED_VERSION = "1.2.0";

/** Set when the staged block has a release-level headline. */
export const UNRELEASED_HEADLINE: string | undefined = undefined;
