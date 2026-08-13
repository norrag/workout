import "server-only";

import { CURRENT_VERSION, RELEASES } from "@/content/releases";
import {
  UNRELEASED_ENTRIES,
  UNRELEASED_HEADLINE,
  UNRELEASED_VERSION,
} from "@/content/releases/unreleased";
import type { Release } from "@/content/releases/types";
import { displayVersion } from "./index";
import { compare } from "./semver";

export interface ReleasePresentation {
  current: string;
  releases: readonly Release[];
}

interface StagedReleasePresentation {
  version: string;
  headline?: string;
  entries: Release["entries"];
}

interface ResolveReleasePresentationInput {
  current: string;
  deployed: string;
  releases: readonly Release[];
  staged: StagedReleasePresentation;
  previewDate: string;
}

/** Pure seam for the staged-preview behavior. */
export function resolveReleasePresentation({
  current,
  deployed,
  releases,
  staged,
  previewDate,
}: ResolveReleasePresentationInput): ReleasePresentation {
  const previewingStagedRelease =
    staged.entries.length > 0 &&
    current === staged.version &&
    compare(current, deployed) > 0;

  if (!previewingStagedRelease) return { current, releases };

  const preview: Release = {
    version: staged.version,
    date: previewDate,
    kind: "feature",
    headline: staged.headline,
    entries: staged.entries,
  };
  return { current, releases: [...releases, preview] };
}

/**
 * Shipped releases plus the staged block when the non-production release
 * override is active. This lets a preview exercise the real modal and history
 * without putting unreleased notes into the production registry.
 */
export function releasePresentation(): ReleasePresentation {
  const current = displayVersion();
  return resolveReleasePresentation({
    current,
    deployed: CURRENT_VERSION,
    releases: RELEASES,
    staged: {
      version: UNRELEASED_VERSION,
      headline: UNRELEASED_HEADLINE,
      entries: UNRELEASED_ENTRIES,
    },
    previewDate: new Date().toISOString().slice(0, 10),
  });
}
