import type { Release } from "./types";
export const RELEASE_1_4_0: Release = {
  version: "1.4.0",
  date: "2026-11-08",
  kind: "feature",
  headline: "Log measurements with your assistant",
  entries: [
    {
      id: "measurement-backlog-import",
      title: "Add new or past measurements",
      body: "Ask your assistant to log tape readings or import dated records. Preview before saving. Identical records are skipped and existing dates are protected.",
      area: "connector",
      highlight: true,
      link: {
        label: "Body measurements",
        target: { kind: "app", href: "/more/measurements" },
      },
    },
  ],
};
