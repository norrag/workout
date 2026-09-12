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
    id: "connector-tool-list-refresh-notice",
    title: "WORKOUT flags an assistant's out-of-date tool list",
    body: "An assistant caches what WORKOUT can do when you connect it and never refreshes on its own, so an older connection can be missing tools. WORKOUT now tells the connections that are behind — and only those — how to refresh.",
    area: "connector",
    highlight: true,
    link: {
      label: "How to refresh",
      target: {
        kind: "guide",
        section: "ug/connecting-an-ai#keeping-the-tools-current",
      },
    },
  },
];

/** The next feature release under construction. */
export const UNRELEASED_VERSION = "1.3.0";

/** Set when the staged block has a release-level headline. */
export const UNRELEASED_HEADLINE: string | undefined = undefined;
