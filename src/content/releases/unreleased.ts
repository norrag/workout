import type { ReleaseEntry } from "./types";

/** Entries for the next feature release. */
export const UNRELEASED_ENTRIES: ReleaseEntry[] = [
  {
    id: "measurement-backlog-import",
    title: "Log measurements with your assistant",
    body: "Ask your assistant to log new tape readings or import dated records. Preview the values before saving. Exact repeats are skipped and existing dates are protected.",
    area: "connector",
    highlight: true,
    link: {
      label: "Body measurements",
      target: { kind: "app", href: "/more/measurements" },
    },
  },
];
export const UNRELEASED_VERSION = "1.4.0";
export const UNRELEASED_HEADLINE: string | undefined = undefined;
