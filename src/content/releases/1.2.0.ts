import type { Release } from "./types";

/**
 * The plate loader (N89): the owner's `Load Weights` Apple Shortcut brought
 * into the app as a bottom tray on the exercise `…` menu, opening on the
 * active set's weight and writing a change back through the same queued
 * `plan_weight` op a weight-cell blur uses.
 */
export const RELEASE_1_2_0: Release = {
  version: "1.2.0",
  date: "2026-08-30",
  kind: "feature",
  headline: "Work out what goes on the bar",
  entries: [
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
  ],
};
