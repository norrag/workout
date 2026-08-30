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
    body: "An exercise's menu now offers Load plates. It opens on that set's weight, asks what the bare bar or machine weighs and how many ends you load, then shows the plates to hang on each side.",
    area: "training",
    highlight: true,
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
