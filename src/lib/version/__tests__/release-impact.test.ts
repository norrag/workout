import { describe, expect, it } from "vitest";
import type { Release } from "@/content/releases/types";
import { checkAnnouncement } from "../release-impact";

const r = (version: string, kind: Release["kind"]): Release => ({
  version,
  date: "2026-08-06",
  kind,
  headline: kind === "fix" ? undefined : `v${version}`,
  entries: [{ id: `${version}-a`, title: "Something", body: "Something." }],
});

const REGISTRY = [r("1.0.0", "major"), r("1.0.1", "fix"), r("1.1.0", "feature")];

describe("checkAnnouncement (doc 23 §9.5)", () => {
  it("lets a none- or fix-classified activation through", () => {
    expect(checkAnnouncement("none", undefined, REGISTRY, "1.1.0").ok).toBe(true);
    expect(checkAnnouncement("fix", undefined, REGISTRY, "1.1.0").ok).toBe(true);
  });

  it("refuses a feature-classified activation with no announcing release", () => {
    const result = checkAnnouncement("feature", undefined, REGISTRY, "1.1.0");
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toMatch(/requires announced_in/);
  });

  it("accepts a feature-classified activation announced by a live release", () => {
    expect(checkAnnouncement("feature", "1.1.0", REGISTRY, "1.1.0")).toEqual({
      ok: true,
      announcedIn: "1.1.0",
    });
  });

  it("refuses a release that does not exist", () => {
    const result = checkAnnouncement("feature", "1.2.0", REGISTRY, "1.1.0");
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toMatch(/no release 1\.2\.0/);
  });

  it("refuses a fix release, which announces nothing", () => {
    const result = checkAnnouncement("feature", "1.0.1", REGISTRY, "1.1.0");
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toMatch(/announces nothing/);
  });

  it("refuses a release that is in the registry but not yet deployed", () => {
    // announce, THEN activate — a note the running app has not published yet
    // cannot explain a number that has already moved
    const result = checkAnnouncement("feature", "1.1.0", REGISTRY, "1.0.1");
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toMatch(/not live yet/);
  });

  it("refuses a malformed version rather than treating it as absent", () => {
    const result = checkAnnouncement("feature", "next", REGISTRY, "1.1.0");
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toMatch(/not a version/);
  });
});
