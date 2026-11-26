import type { Release } from "./types";

export const RELEASE_1_4_2: Release = {
  version: "1.4.2",
  date: "2026-11-26",
  kind: "fix",
  entries: [
    {
      id: "exercise-secondary-muscle-credit",
      title: "Secondary muscle credit in volume totals",
      body: "Presses, rows, and other exercises give half-set credit to the secondary muscles they train. Current and past volume totals reflect those assignments without changing your logged sets or saved plans.",
      area: "stats",
    },
  ],
};
