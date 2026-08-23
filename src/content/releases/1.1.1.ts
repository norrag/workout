import type { Release } from "./types";

/**
 * A fix release (doc 23 §4.1): no headline, no highlights, no modal — it is
 * listed in the version history and nothing else. The prescription strip's
 * reasoning disagreed with the record printed beneath it; the numbers it was
 * describing were correct throughout (N89).
 */
export const RELEASE_1_1_1: Release = {
  version: "1.1.1",
  date: "2026-08-23",
  kind: "fix",
  entries: [
    {
      id: "prescription-strip-compares-logged-work",
      title: "The prescription's reasoning compares what you logged",
      body: "The strip compared this session against last session's prescription rather than the sets you logged, so a session you loaded differently could read as a weight change that never happened. It now compares against your logged work.",
      area: "training",
    },
  ],
};
