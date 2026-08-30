import { compare } from "@/lib/version/semver";
import { RELEASE_1_0_0 } from "./1.0.0";
import { RELEASE_1_1_0 } from "./1.1.0";
import { RELEASE_1_2_0 } from "./1.2.0";
import type { Release } from "./types";

export type {
  Release,
  ReleaseArea,
  ReleaseEntry,
  ReleaseKind,
  ReleaseTarget,
} from "./types";
export { CONTENT_LIMITS } from "./types";

/**
 * doc 23 §5 — every shipped release, oldest first, frozen.
 *
 * A release PR adds its `<version>.ts` file to this list and to nothing else.
 * Entries still accumulating live in `unreleased.ts`, which is deliberately not
 * imported here (§9.2): unreleased work cannot reach the history because there
 * is no path from that file to this array.
 */
export const RELEASES: readonly Release[] = Object.freeze(
  [RELEASE_1_0_0, RELEASE_1_1_0, RELEASE_1_2_0].sort((a, b) =>
    compare(a.version, b.version),
  ),
);

/** Newest first — the version history's render order (§8). */
export const RELEASES_NEWEST_FIRST: readonly Release[] = Object.freeze(
  [...RELEASES].reverse(),
);

/**
 * The deployed version. Derived from the registry so the three-way identity
 * (`package.json` / this constant / max(RELEASES)) has one author; CI asserts
 * the other two agree with it (§9.4).
 */
export const CURRENT_VERSION: string =
  RELEASES[RELEASES.length - 1]?.version ?? "0.0.0";

export function releaseByVersion(version: string): Release | undefined {
  return RELEASES.find((r) => r.version === version);
}
