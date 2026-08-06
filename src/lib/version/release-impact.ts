import type { Release } from "@/content/releases/types";
import { compare, tryParse } from "./semver";

/**
 * doc 23 §9.5 — an `engine_params` activation carries its own release impact.
 *
 * T10: activating a parameter set changes the numbers a user is prescribed
 * while the code deploy that carried it announced nothing (v20/v23/v26 all
 * shipped inactive and were activated later by an owner-gated MCP step). Under
 * §4.2's rule a changed number is a feature release even with no UI diff — the
 * doc 10 §9 honesty position applied to releases.
 *
 * The classification does not have to be a guess: `replay_decisions` already
 * reports the diff a version would produce, so `none` is a claim the caller
 * can check rather than assume.
 */
export type ReleaseImpact = "none" | "fix" | "feature";

export const RELEASE_IMPACT_MEANING: Record<ReleaseImpact, string> = {
  none: "no number any user sees moves — a parameter added but not yet read, a comment, a re-tuning that replays identically",
  fix: "a number was wrong and is now right; rides a fix release, one line in the history",
  feature:
    "behavior users should be told about changed; requires a feature release announcing it, live before activation",
};

export type AnnouncementCheck =
  | { ok: true; announcedIn?: string }
  | { ok: false; error: string };

/**
 * The guard that turns T10 from runbook discipline into a check.
 *
 * `activate_engine_params` already refuses to act unless `confirm_version`
 * echoes `version`; this is the same shape of refusal. A `feature`-classified
 * activation must name a release that is **already live** — present in the
 * registry and at or below the deployed version — so the announcement reaches
 * users before, or with, the numbers it explains. `manual-operations.md` keeps
 * the ordering rule: announce, then activate, same day.
 */
export function checkAnnouncement(
  impact: ReleaseImpact,
  announcedIn: string | undefined,
  releases: readonly Release[],
  current: string,
): AnnouncementCheck {
  if (impact !== "feature") return { ok: true };
  if (!announcedIn)
    return {
      ok: false,
      error:
        'release_impact "feature" requires announced_in — the version of the live release that tells users about this change (doc 23 §9.5). Cut that release first, then activate.',
    };
  if (!tryParse(announcedIn))
    return { ok: false, error: `announced_in "${announcedIn}" is not a version.` };
  const release = releases.find((r) => r.version === announcedIn);
  if (!release)
    return {
      ok: false,
      error: `no release ${announcedIn} exists in the registry — a feature-classified activation must be announced by a shipped release.`,
    };
  if (release.kind === "fix")
    return {
      ok: false,
      error: `release ${announcedIn} is a fix release and announces nothing; a feature-classified activation needs a feature or major release.`,
    };
  if (compare(current, announcedIn) < 0)
    return {
      ok: false,
      error: `release ${announcedIn} is not live yet (deployed version is ${current}). Announce first, then activate.`,
    };
  return { ok: true, announcedIn };
}
