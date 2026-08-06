import type { ReleaseEntry } from "./types";

/**
 * doc 23 §9.2/§9.3 — the staged manifest.
 *
 * An ordinary PR that changes something a user would notice appends its entry
 * here. Nothing in this file is part of `RELEASES`, so the version history
 * **structurally cannot** show it — that property falls out of the data model
 * rather than being enforced by a rule.
 *
 * The release PR moves these entries into `<version>.ts`, edits them so a
 * block written one PR at a time reads as one release, and leaves this array
 * empty again. That merge is also what flips every `releaseActive("<version>")`
 * gate on: the release PR *is* the switch.
 */
export const UNRELEASED_ENTRIES: ReleaseEntry[] = [
  {
    // doc 22 Phase 1 (N74) — the manual renders the glossary's own words
    // (§8.1), which is what surfaced the inverted clause. Ledger row D-01 in
    // `docs/22a-manual-claims.md`.
    id: "glossary-e1rm-rir-direction",
    title: "What reps in reserve do to a strength estimate",
    body: "The card explaining your estimated one-rep max spells the term out, and says which way reps in reserve push it: at the same weight and reps, a set with reps to spare implies more strength than one taken to failure.",
    area: "training",
  },
];

/**
 * The version these staged entries are slated for — the string used by
 * `releaseActive(...)` at the gated call sites. Kept next to the entries so the
 * release PR has one place to look.
 */
export const UNRELEASED_VERSION = "1.1.0";
