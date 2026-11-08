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
    id: "monthly-body-measurements",
    title: "Keep a monthly record of body measurements",
    body: "Log monthly tape measurements in More. Record any sites and compare dated changes. Your assistant can read the measurements and same-site changes alongside your training and DEXA records.",
    area: "stats",
    highlight: true,
    featured: true,
    link: {
      label: "Body measurements",
      target: { kind: "app", href: "/more/measurements" },
    },
  },
  {
    id: "connector-tool-list-refresh-notice",
    title: "Know when your AI tools need a refresh",
    body: "WORKOUT tells older assistant connections when to refresh their tool list.",
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
  {
    id: "sign-in-form-hydration",
    title: "Sign in without a page reset",
    body: "Fixed an error that could reset the sign-in form while the page opened.",
    area: "app",
    highlight: false,
  },
];

/** The next feature release under construction. */
export const UNRELEASED_VERSION = "1.3.0";

/** Set when the staged block has a release-level headline. */
export const UNRELEASED_HEADLINE: string | undefined =
  "Track size changes between scans";
