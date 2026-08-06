import type { Release } from "@/content/releases/types";
import { compare } from "./semver";

/**
 * doc 23 §6.3/§6.5 — what this account is owed, as a discriminated union.
 *
 * `prime` is not a degenerate "none": it names the state *this account has no
 * history with the app*, which is precisely what a future guided tour wants
 * (§6.5). Naming it now means a tour is added as a branch rather than as a
 * rework of the gate. `last_seen_version` itself stays single-purpose — a tour
 * needs its own signal, because a user can finish the tour and still be owed
 * three release notes.
 */
export type VersionGate =
  | { kind: "prime" }
  | { kind: "whats-new"; releases: Release[] }
  | { kind: "none" };

/**
 * Pure selection over the registry. Resolved in a **server component** (T2):
 * `CURRENT_VERSION` is compiled into the bundle, so a tab running yesterday's
 * JS would otherwise compare against yesterday's constant.
 */
export function versionGate(
  lastSeen: string | null,
  releases: readonly Release[],
  current: string,
): VersionGate {
  // T3 — a new account has no history to be shown. Prime it and show nothing.
  if (lastSeen == null) return { kind: "prime" };
  // T8 — a rollback leaves last-seen above current; the gate is a no-op there,
  // and a re-release must take a new number rather than re-issue the old one.
  if (compare(current, lastSeen) <= 0) return { kind: "none" };
  // T4 — skipped releases accumulate: a user away for three feature releases
  // gets one modal covering all three, not three modals and not just the newest.
  const pending = releases.filter(
    (r) =>
      r.kind !== "fix" &&
      compare(r.version, lastSeen) > 0 &&
      compare(r.version, current) <= 0,
  );
  return pending.length > 0
    ? { kind: "whats-new", releases: pending }
    : { kind: "none" };
}
