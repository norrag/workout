// doc 23 §5 — the release registry's shape.
//
// Release notes are typed data in the repo, not rows in the database (§5.1).
// A note is a *claim about the deployed code*: keeping it here makes "a note
// describing a feature the bundle doesn't have" unrepresentable, because the
// entry and the feature merge, deploy, and roll back together (T1).

import type { LinkableRoute } from "./links";

/** §4.1 — the digits, named by audience rather than by API compatibility. */
export type ReleaseKind = "major" | "feature" | "fix";

export type ReleaseTarget =
  | { kind: "app"; href: LinkableRoute } // §7.1 — allowlisted, no IDs
  | { kind: "guide"; section: string }; // §7.2 — doc 22 §9.4 section IDs

export type ReleaseArea =
  "training" | "planning" | "stats" | "connector" | "app";

export interface ReleaseEntry {
  /** stable, unique across all releases; never reused */
  id: string;
  /** one line, sentence case, no trailing period */
  title: string;
  /** 1–3 plain-language sentences: what you can now do */
  body: string;
  /** where "explore" goes; omit when there is nothing to open */
  link?: { label: string; target: ReleaseTarget };
  /**
   * One of the 1–3 headline changes shown in the once-only release modal.
   * Every release entry remains visible in full under More → What's new.
   */
  highlight?: boolean;
  area?: ReleaseArea;
}

export interface Release {
  /** "1.1.0" */
  version: string;
  /** ISO date it reached main */
  date: string;
  kind: ReleaseKind;
  /** the modal's title line; feature/major releases only */
  headline?: string;
  entries: ReleaseEntry[];
  /** forward-compat for doc 20 §3.4 (O7); defaults to "workout" */
  surface?: "workout" | "measure";
}

/** §5.2 length budget — enforced by the registry test, not by care. */
export const CONTENT_LIMITS = {
  headline: 60,
  title: 60,
  body: 240,
  linkLabel: 32,
  maxHighlights: 3,
} as const;
