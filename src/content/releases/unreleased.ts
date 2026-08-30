import type { ReleaseEntry } from "./types";

/**
 * doc 23 §9.2/§9.3 — the staged manifest.
 *
 * Ordinary PRs append user-visible changes here. A release PR moves the
 * completed block into `<version>.ts`, then leaves this array empty and moves
 * `UNRELEASED_VERSION` to the next feature version.
 */
export const UNRELEASED_ENTRIES: ReleaseEntry[] = [];

/** The next feature release under construction. */
export const UNRELEASED_VERSION = "1.3.0";

/** Set when the staged block has a release-level headline. */
export const UNRELEASED_HEADLINE: string | undefined = undefined;
