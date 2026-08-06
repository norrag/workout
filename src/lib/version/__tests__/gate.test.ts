import { describe, expect, it } from "vitest";
import type { Release } from "@/content/releases/types";
import { versionGate } from "../gate";
import { resolveEffectiveVersion } from "..";

// a fixture registry, so the gate's behavior is not hostage to the real one
const r = (version: string, kind: Release["kind"]): Release => ({
  version,
  date: "2026-08-06",
  kind,
  headline: kind === "fix" ? undefined : `v${version}`,
  entries: [{ id: `${version}-a`, title: "Something", body: "Something." }],
});

const FIXTURE: Release[] = [
  r("1.0.0", "major"),
  r("1.0.1", "fix"),
  r("1.1.0", "feature"),
  r("1.1.1", "fix"),
  r("1.2.0", "feature"),
  r("1.3.0", "feature"),
];

const versions = (g: ReturnType<typeof versionGate>) =>
  g.kind === "whats-new" ? g.releases.map((x) => x.version) : [];

describe("versionGate", () => {
  it("primes a new account and shows it nothing (T3)", () => {
    expect(versionGate(null, FIXTURE, "1.3.0")).toEqual({ kind: "prime" });
  });

  it("shows nothing to an up-to-date account", () => {
    expect(versionGate("1.3.0", FIXTURE, "1.3.0")).toEqual({ kind: "none" });
  });

  it("accumulates every skipped feature release, not just the newest (T4)", () => {
    const gate = versionGate("1.0.0", FIXTURE, "1.3.0");
    expect(gate.kind).toBe("whats-new");
    expect(versions(gate)).toEqual(["1.1.0", "1.2.0", "1.3.0"]);
  });

  it("covers a single skipped release", () => {
    expect(versions(versionGate("1.2.0", FIXTURE, "1.3.0"))).toEqual(["1.3.0"]);
  });

  it("shows nothing when only fix releases happened in the interval", () => {
    expect(versionGate("1.1.0", FIXTURE, "1.1.1")).toEqual({ kind: "none" });
  });

  it("never selects a release above the deployed version", () => {
    // a bundle serving 1.1.0 must not announce 1.2.0 even though the registry
    // it was built from could not contain it — belt and braces
    expect(versions(versionGate("1.0.0", FIXTURE, "1.1.0"))).toEqual(["1.1.0"]);
  });

  it("is a no-op after a rollback (T8)", () => {
    // the user acknowledged 1.3.0; the deploy reverted to 1.2.0
    expect(versionGate("1.3.0", FIXTURE, "1.2.0")).toEqual({ kind: "none" });
  });

  it("includes a major release, not only feature releases", () => {
    expect(versions(versionGate("0.9.0", FIXTURE, "1.1.0"))).toEqual([
      "1.0.0",
      "1.1.0",
    ]);
  });
});

describe("resolveEffectiveVersion (the preview escape, §9.2)", () => {
  it("is the registry version with no override", () => {
    expect(resolveEffectiveVersion({ current: "1.0.0" })).toBe("1.0.0");
  });

  it("raises the effective version on a preview deploy", () => {
    expect(
      resolveEffectiveVersion({
        current: "1.0.0",
        override: "1.1.0",
        vercelEnv: "preview",
      }),
    ).toBe("1.1.0");
  });

  it("is inert in production", () => {
    expect(
      resolveEffectiveVersion({
        current: "1.0.0",
        override: "1.1.0",
        vercelEnv: "production",
      }),
    ).toBe("1.0.0");
  });

  it("never lowers the version, and ignores a malformed override", () => {
    expect(
      resolveEffectiveVersion({
        current: "1.2.0",
        override: "1.1.0",
        vercelEnv: "preview",
      }),
    ).toBe("1.2.0");
    expect(
      resolveEffectiveVersion({
        current: "1.2.0",
        override: "next",
        vercelEnv: "preview",
      }),
    ).toBe("1.2.0");
  });
});
