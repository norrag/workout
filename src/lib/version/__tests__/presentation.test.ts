import { afterEach, describe, expect, it, vi } from "vitest";
import { CURRENT_VERSION, RELEASES } from "@/content/releases";
import { UNRELEASED_VERSION } from "@/content/releases/unreleased";
import type { ReleaseEntry } from "@/content/releases/types";
import {
  releasePresentation,
  resolveReleasePresentation,
} from "../presentation";

afterEach(() => vi.unstubAllEnvs());

describe("releasePresentation", () => {
  it("adds the staged release to non-production modal/history previews", () => {
    const stagedEntries: ReleaseEntry[] = [
      {
        id: "next-feature",
        title: "A staged feature",
        body: "A staged feature can be reviewed before it enters the shipped registry.",
        area: "app",
        highlight: true,
        link: {
          label: "Open More",
          target: { kind: "app", href: "/more" },
        },
      },
    ];
    const presentation = resolveReleasePresentation({
      current: "1.2.0",
      deployed: CURRENT_VERSION,
      releases: RELEASES,
      staged: {
        version: "1.2.0",
        headline: "What comes next",
        entries: stagedEntries,
      },
      previewDate: "2026-08-13",
    });

    expect(presentation.current).toBe("1.2.0");
    expect(presentation.releases).toHaveLength(RELEASES.length + 1);
    expect(presentation.releases.at(-1)).toMatchObject({
      version: "1.2.0",
      kind: "feature",
      headline: "What comes next",
      entries: stagedEntries,
    });
  });

  it("does not invent a preview release for an empty staged block", () => {
    expect(
      resolveReleasePresentation({
        current: UNRELEASED_VERSION,
        deployed: CURRENT_VERSION,
        releases: RELEASES,
        staged: { version: UNRELEASED_VERSION, entries: [] },
        previewDate: "2026-08-13",
      }),
    ).toEqual({ current: UNRELEASED_VERSION, releases: RELEASES });
  });

  it("keeps staged notes out of production", () => {
    vi.stubEnv("NEXT_PUBLIC_RELEASE_OVERRIDE", UNRELEASED_VERSION);
    vi.stubEnv("NEXT_PUBLIC_VERCEL_ENV", "production");

    expect(releasePresentation()).toEqual({
      current: CURRENT_VERSION,
      releases: RELEASES,
    });
  });
});
