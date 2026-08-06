import { CURRENT_VERSION } from "@/content/releases";
import { compare } from "./semver";

export { compare, format, parse, step, tryParse } from "./semver";
export type { ParsedVersion, VersionStep } from "./semver";
export { versionGate } from "./gate";
export type { VersionGate } from "./gate";
export { suppressWhatsNew } from "./suppression";
export type { ActiveWorkoutStatus, SuppressionInput } from "./suppression";
export { checkAnnouncement, RELEASE_IMPACT_MEANING } from "./release-impact";
export type { AnnouncementCheck, ReleaseImpact } from "./release-impact";
export { CURRENT_VERSION };

/**
 * doc 23 §9.2 — the go-live mechanism. **The version is the flag.**
 *
 * A user-visible change merges to `main` behind `releaseActive("1.1.0")` and
 * stays invisible, because `CURRENT_VERSION` comes from the registry and the
 * registry only gains `1.1.0.ts` in the release PR. That one merge flips every
 * accumulated gate, bumps the version, publishes the notes, and starts the
 * modals — no separate flag system, no env var, no database toggle.
 *
 * The cost is honest and stated in §9.2: a gated feature carries both code
 * paths until the release lands, which argues for time-boxing a block to weeks
 * and for gating only what genuinely must not appear early.
 */
export function releaseActive(version: string): boolean {
  return compare(effectiveVersion(), version) >= 0;
}

/**
 * The version the running bundle should behave as. Normally `CURRENT_VERSION`;
 * on a non-production deploy, `NEXT_PUBLIC_RELEASE_OVERRIDE` may raise it so a
 * staged block can be reviewed before it is flipped on (§9.2 cost 3).
 *
 * Pure, so the "inert in production" property is a unit test rather than a
 * claim. The override is env-gated rather than user-gated: there is no auth
 * surface and no way to reach it in production.
 */
export function resolveEffectiveVersion(env: {
  current: string;
  override?: string;
  vercelEnv?: string;
}): string {
  if (env.vercelEnv === "production") return env.current;
  const override = env.override?.trim();
  if (!override) return env.current;
  // never lower the effective version — an override is for previewing what is
  // coming, not for hiding what already shipped
  try {
    return compare(override, env.current) > 0 ? override : env.current;
  } catch {
    return env.current;
  }
}

function effectiveVersion(): string {
  // NEXT_PUBLIC_* must be static member expressions so Next can inline them
  // into client bundles (same reason as `lib/env.ts`)
  return resolveEffectiveVersion({
    current: CURRENT_VERSION,
    override: process.env.NEXT_PUBLIC_RELEASE_OVERRIDE,
    vercelEnv:
      process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.VERCEL_ENV ?? undefined,
  });
}

/** The version the app should *display* — the override included, off prod. */
export function displayVersion(): string {
  return effectiveVersion();
}
