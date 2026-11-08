import type { Release } from "./types";

export const RELEASE_1_3_0: Release = {
  version: "1.3.0",
  date: "2026-11-08",
  kind: "feature",
  headline: "Track size changes between scans",
  entries: [
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
    {
      id: "navigation-queue-correction",
      title: "Keep navigation moving after an action",
      body: "Fixed a framework issue that could leave a page waiting after sign-in or another action.",
      area: "app",
      highlight: false,
    },
  ],
};
