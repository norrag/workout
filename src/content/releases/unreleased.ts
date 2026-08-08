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
  {
    // doc 22 Phase 2 (N74) — the reading surface. The chapters themselves land
    // over Phase 3; this entry is what 1.1.0 announces, so it describes the
    // guide rather than any one chapter.
    id: "user-guide",
    title: "A guide to the app, built into it",
    body: "More → Guide explains what each screen does and how the numbers are worked out, in short sections you can read one at a time. Search it, or open a chapter and read straight through.",
    area: "app",
    link: {
      label: "Open the guide",
      target: { kind: "app", href: "/more/guide" },
    },
  },
  {
    // doc 22 Phase 6 (N74) — the AI Manual, and the connector page becoming its
    // front door. Its own entry rather than a line in `user-guide`: a reader who
    // has never opened the connector settings has no use for it, and a reader
    // who has is the whole audience.
    id: "ai-manual",
    title: "A manual for the AI connector",
    body: "More → AI connector carries its own manual: how to connect a client, what it is allowed to do, and worked examples of planning a macrocycle, drafting a block, and checking whether a lift is really moving.",
    area: "connector",
    link: {
      label: "Open the AI manual",
      target: { kind: "app", href: "/more/connector/guide" },
    },
  },
  {
    // N82 — the day-view focus pass. A layout change with no new capability,
    // which is exactly the case doc 23 §4.2 says still owes an entry: the
    // controls a returning user reaches for have moved.
    id: "day-view-focus-pass",
    title: "A quieter workout screen",
    body: "Each exercise now carries one menu instead of a row of buttons. Tap the exercise's name to open the program's reasoning; its history, notes and effort target are grouped inside the menu.",
    area: "training",
    link: {
      label: "Open your workout",
      target: { kind: "app", href: "/workout" },
    },
  },
  {
    // doc 22 Phase 5 (N74) — the connector's retrieval surface. `22d` §10
    // called this out in advance as a user-visible capability that owes an
    // entry: an AI that can read the guide answers differently.
    id: "connector-reads-the-guide",
    title: "Your AI can read the guide",
    body: "A connected AI can search the guide and read a section back, so an answer about how the app works comes from the guide's own words — and it can tell you which section to open.",
    area: "connector",
    link: {
      label: "Connector settings",
      target: { kind: "app", href: "/more/connector" },
    },
  },
];

/**
 * The version these staged entries are slated for — the string used by
 * `releaseActive(...)` at the gated call sites. Kept next to the entries so the
 * release PR has one place to look.
 */
export const UNRELEASED_VERSION = "1.1.0";
